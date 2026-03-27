"""Codex app-server backed provider adapter."""

import asyncio
import json
import logging
import os
import sys
from typing import Any, Dict, List, Optional

from .config import CODEX_DEFAULT_MODEL

logger = logging.getLogger(__name__)
RPC_REQUEST_TIMEOUT = 20.0


class CodexAppServerClient:
    """Minimal JSON-RPC client for `codex app-server`."""

    def __init__(self) -> None:
        self.project_dir = os.getcwd()
        self.process: Optional[asyncio.subprocess.Process] = None
        self.next_id = 1
        self.pending: dict[int, asyncio.Future] = {}
        self.current_turn: Optional[dict[str, Any]] = None
        self.init_lock = asyncio.Lock()
        self.turn_lock = asyncio.Lock()
        self.initialized = False
        self.ready = False
        self.reader_task: Optional[asyncio.Task] = None
        self.stderr_task: Optional[asyncio.Task] = None

    async def ensure_started(self) -> None:
        async with self.init_lock:
            if self.ready and self.process and self.process.returncode is None:
                logger.info("CODEX ensure_started: already ready, skipping")
                return

            if not self.process or self.process.returncode is not None:
                logger.info("CODEX ensure_started: process not running, spawning")
                await self._spawn()
                logger.info("CODEX ensure_started: spawn complete, pid=%s", getattr(self.process, 'pid', 'unknown'))

            if not self.initialized:
                logger.info("CODEX ensure_started: sending initialize request")
                result = await self._send_request(
                    "initialize",
                    {
                        "clientInfo": {
                            "name": "llm-council-backend",
                            "title": "LLM Council Backend",
                            "version": "0.1.0",
                        },
                    },
                )
                logger.info("CODEX ensure_started: initialize response=%s", result)
                logger.info("CODEX ensure_started: sending initialized notification")
                await self._send_notification("initialized", {})
                logger.info("CODEX ensure_started: initialized notification sent")
                self.initialized = True

            logger.info("CODEX ensure_started: sending account/read")
            account_result = await self._send_request("account/read", {"refreshToken": False})
            logger.info("CODEX ensure_started: account/read response=%s", account_result)
            if not account_result or not account_result.get("account"):
                raise RuntimeError("Codex is not signed in. Run `codex login` before using the codex provider.")

            self.ready = True
            logger.info("CODEX ensure_started: ready=True")

    async def query(self, model_alias: str, messages: List[Dict[str, str]], timeout: float) -> Optional[Dict[str, Any]]:
        await self.ensure_started()

        async with self.turn_lock:
            thread_result = await self._send_request(
                "thread/start",
                {
                    "model": self._resolve_model(model_alias),
                    "cwd": self.project_dir,
                    "serviceName": "llm_council_backend",
                },
            )
            thread_id = thread_result.get("thread", {}).get("id")
            if not thread_id:
                raise RuntimeError("Codex did not return a thread id.")

            loop = asyncio.get_running_loop()
            turn_future = loop.create_future()
            self.current_turn = {
                "future": turn_future,
                "chunks": [],
            }

            try:
                await self._send_request(
                    "turn/start",
                    {
                        "threadId": thread_id,
                        "input": [{"type": "text", "text": self._messages_to_prompt(messages)}],
                    },
                )
                await asyncio.wait_for(turn_future, timeout=timeout)
                content = "".join(self.current_turn["chunks"]).strip()
                return {
                    "content": content,
                    "reasoning_details": None,
                }
            finally:
                self.current_turn = None

    async def _spawn(self) -> None:
        if sys.platform == "win32":
            command = ("cmd.exe", "/d", "/s", "/c", "codex", "app-server")
        else:
            command = ("codex", "app-server")

        logger.info("CODEX _spawn: command=%s cwd=%s platform=%s", command, self.project_dir, sys.platform)
        try:
            self.process = await asyncio.create_subprocess_exec(
                *command,
                cwd=self.project_dir,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            logger.info("CODEX _spawn: process started pid=%s", self.process.pid)
        except Exception as exc:
            logger.error("CODEX _spawn: FAILED to start process: %s: %s", type(exc).__name__, exc)
            raise

        self.reader_task = asyncio.create_task(self._read_stdout())
        self.stderr_task = asyncio.create_task(self._read_stderr())
        self.initialized = False
        self.ready = False

    async def _read_stdout(self) -> None:
        assert self.process is not None and self.process.stdout is not None
        logger.info("CODEX _read_stdout: reader started")

        while True:
            line = await self.process.stdout.readline()
            if not line:
                break

            text = line.decode("utf-8", errors="replace").strip()
            if not text:
                continue

            logger.info("CODEX stdout: %s", text[:500])

            try:
                message = json.loads(text)
            except json.JSONDecodeError:
                logger.warning("CODEX stdout: non-JSON line: %s", text)
                continue

            self._handle_message(message)

        rc = self.process.returncode
        logger.error("CODEX _read_stdout: EOF reached, process returncode=%s", rc)
        self._handle_exit(RuntimeError(f"Codex app-server exited unexpectedly (returncode={rc})."))

    async def _read_stderr(self) -> None:
        assert self.process is not None and self.process.stderr is not None
        logger.info("CODEX _read_stderr: reader started")

        while True:
            line = await self.process.stderr.readline()
            if not line:
                break
            text = line.decode("utf-8", errors="replace").strip()
            if text:
                logger.warning("CODEX stderr: %s", text)

        logger.info("CODEX _read_stderr: EOF reached")

    def _handle_message(self, message: Dict[str, Any]) -> None:
        if "id" in message:
            pending = self.pending.pop(message["id"], None)
            if not pending:
                return

            if message.get("error"):
                error = RuntimeError(message["error"].get("message", "Codex RPC error"))
                if not pending.done():
                    pending.set_exception(error)
                return

            if not pending.done():
                pending.set_result(message.get("result", {}))
            return

        if message.get("error"):
            logger.error("Codex notification error: %s", message["error"])
            if self.current_turn and not self.current_turn["future"].done():
                self.current_turn["future"].set_exception(
                    RuntimeError(message["error"].get("message", "Codex notification error"))
                )
            return

        method = message.get("method")
        params = message.get("params", {})

        if method == "item/agentMessage/delta":
            if self.current_turn is not None:
                self.current_turn["chunks"].append(params.get("delta", ""))
            return

        if method == "turn/completed":
            if self.current_turn and not self.current_turn["future"].done():
                self.current_turn["future"].set_result(params)
            return

        if method == "item/commandExecution/requestApproval":
            logger.error("Codex command approval requested during backend turn: %s", json.dumps(params))
            if self.current_turn and not self.current_turn["future"].done():
                self.current_turn["future"].set_exception(
                    RuntimeError("Codex requested interactive command approval; backend provider mode is non-interactive.")
                )
            return

        if method == "item/fileChange/requestApproval":
            logger.error("Codex file change approval requested during backend turn: %s", json.dumps(params))
            if self.current_turn and not self.current_turn["future"].done():
                self.current_turn["future"].set_exception(
                    RuntimeError("Codex requested interactive file approval; backend provider mode is non-interactive.")
                )
            return

        if method == "account/updated":
            logger.info("Codex auth mode updated: %s", params.get("authMode"))
            return

    def _handle_exit(self, error: Exception) -> None:
        self.ready = False
        self.initialized = False

        for pending in self.pending.values():
            if not pending.done():
                pending.set_exception(error)
        self.pending.clear()

        if self.current_turn and not self.current_turn["future"].done():
            self.current_turn["future"].set_exception(error)
        self.current_turn = None

    async def _send_request(
        self,
        method: str,
        params: Dict[str, Any],
        timeout: float = RPC_REQUEST_TIMEOUT,
    ) -> Dict[str, Any]:
        if not self.process or self.process.returncode is not None or not self.process.stdin:
            rc = getattr(self.process, 'returncode', 'N/A') if self.process else 'no process'
            raise RuntimeError(f"Codex app-server is not available (returncode={rc}).")

        request_id = self.next_id
        self.next_id += 1

        loop = asyncio.get_running_loop()
        future = loop.create_future()
        self.pending[request_id] = future

        payload = {
            "method": method,
            "id": request_id,
            "params": params,
        }
        logger.info("CODEX _send_request: id=%d method=%s", request_id, method)
        self.process.stdin.write((json.dumps(payload) + "\n").encode("utf-8"))
        await self.process.stdin.drain()
        try:
            result = await asyncio.wait_for(future, timeout=timeout)
            logger.info("CODEX _send_request: id=%d method=%s -> response keys=%s", request_id, method, list(result.keys()) if isinstance(result, dict) else type(result).__name__)
            return result
        except asyncio.TimeoutError as exc:
            self.pending.pop(request_id, None)
            raise RuntimeError(f"Codex request timed out waiting for '{method}' response.") from exc

    async def _send_notification(self, method: str, params: Dict[str, Any]) -> None:
        if not self.process or self.process.returncode is not None or not self.process.stdin:
            raise RuntimeError("Codex app-server is not available.")

        payload = {
            "method": method,
            "params": params,
        }
        self.process.stdin.write((json.dumps(payload) + "\n").encode("utf-8"))
        await self.process.stdin.drain()

    @staticmethod
    def _messages_to_prompt(messages: List[Dict[str, str]]) -> str:
        lines = []
        for message in messages:
            role = message.get("role", "user").upper()
            content = message.get("content", "")
            lines.append(f"{role}: {content}")
        return "\n\n".join(lines).strip()

    @staticmethod
    def _resolve_model(model_alias: str) -> str:
        value = (model_alias or "").strip()
        if not value or value == "local":
            return CODEX_DEFAULT_MODEL
        return value


_CLIENT = CodexAppServerClient()


async def query_model(
    model: str,
    messages: List[Dict[str, str]],
    timeout: float = 120.0,
) -> Optional[Dict[str, Any]]:
    """Query the local Codex provider. Raises on failure so callers can capture the reason."""
    try:
        return await _CLIENT.query(model, messages, timeout=timeout)
    except Exception as exc:
        logger.error("Error querying Codex model %s: %s", model, exc)
        raise
