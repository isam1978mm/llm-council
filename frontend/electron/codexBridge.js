/* global process */
import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { EventEmitter } from 'node:events';

const CLIENT_INFO = {
  name: 'llm-council-electron',
  title: 'LLM Council',
  version: '0.1.0',
};

export class CodexBridge extends EventEmitter {
  constructor(options = {}) {
    super();
    this.projectDir = options.projectDir ?? process.cwd();
    this.model = options.model ?? 'gpt-5.4';
    this.serviceName = options.serviceName ?? 'llm_council';
    this.codexProcess = null;
    this.readline = null;
    this.nextId = 1;
    this.pending = new Map();
    this.startPromise = null;
    this.threadId = null;
    this.account = null;
    this.activeTurn = false;
    this.isInitialized = false;
  }

  async start() {
    if (this.startPromise) {
      return this.startPromise;
    }

    if (this.codexProcess && !this.codexProcess.killed && this.account) {
      return {
        threadId: this.threadId,
        account: this.account,
      };
    }

    this.startPromise = this.#startInternal();
    try {
      return await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  async #startInternal() {
    if (!this.codexProcess || this.codexProcess.killed) {
      this.#spawnProcess();
    }

    this.emit('event', {
      type: 'status',
      phase: 'starting',
      message: 'Starting Codex app-server...',
    });

    if (!this.isInitialized) {
      await this.#sendRequest('initialize', {
        clientInfo: CLIENT_INFO,
      });

      this.#sendNotification('initialized', {});
      this.isInitialized = true;
    }

    const accountResult = await this.#sendRequest('account/read', {
      refreshToken: false,
    });

    this.account = accountResult?.account ?? null;

    if (!this.account) {
      const message = 'Codex is not signed in. Run `codex login` in a terminal first.';
      this.emit('event', {
        type: 'error',
        message,
      });
      throw new Error(message);
    }

    this.emit('event', {
      type: 'account',
      account: this.account,
      message: `Signed in via Codex (${this.account.type ?? 'unknown'}).`,
    });

    this.emit('event', {
      type: 'status',
      phase: 'ready',
      message: 'Codex is ready.',
    });

    return {
      threadId: this.threadId,
      account: this.account,
    };
  }

  async sendPrompt(prompt) {
    const trimmedPrompt = String(prompt ?? '').trim();
    if (!trimmedPrompt) {
      throw new Error('Prompt is required.');
    }

    if (this.activeTurn) {
      throw new Error('A Codex turn is already in progress.');
    }

    await this.start();
    await this.#ensureThread();

    this.activeTurn = true;
    this.emit('event', {
      type: 'turnStarted',
      threadId: this.threadId,
      prompt: trimmedPrompt,
    });

    try {
      await this.#sendRequest('turn/start', {
        threadId: this.threadId,
        input: [{ type: 'text', text: trimmedPrompt }],
      });
    } catch (error) {
      this.activeTurn = false;
      throw error;
    }
  }

  async stop() {
    this.startPromise = null;
    this.activeTurn = false;
    this.threadId = null;
    this.account = null;
    this.isInitialized = false;

    for (const [id, pending] of this.pending.entries()) {
      pending.reject(new Error(`Codex stopped before request ${id} completed.`));
    }
    this.pending.clear();

    if (this.readline) {
      this.readline.close();
      this.readline = null;
    }

    if (this.codexProcess && !this.codexProcess.killed) {
      this.codexProcess.kill();
    }

    this.codexProcess = null;
    this.emit('event', {
      type: 'status',
      phase: 'stopped',
      message: 'Codex stopped.',
    });
  }

  #spawnProcess() {
    const spawnOptions = {
      cwd: this.projectDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    };

    this.codexProcess =
      process.platform === 'win32'
        ? spawn('cmd.exe', ['/d', '/s', '/c', 'codex', 'app-server'], spawnOptions)
        : spawn('codex', ['app-server'], spawnOptions);

    this.codexProcess.on('error', (error) => {
      console.error('[codex spawn error]', error);
      this.emit('event', {
        type: 'error',
        message: `Failed to start Codex: ${error.message}`,
      });
      this.isInitialized = false;
      this.#rejectAll(error);
    });

    this.codexProcess.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      if (!text.trim()) {
        return;
      }
      console.error('[codex stderr]', text);
      this.emit('event', {
        type: 'log',
        level: 'stderr',
        message: text.trim(),
      });
    });

    this.codexProcess.on('exit', (code, signal) => {
      console.error(`[codex exited] code=${code} signal=${signal ?? 'none'}`);
      this.emit('event', {
        type: 'exit',
        code,
        signal,
        message: `Codex exited with code ${code}${signal ? ` (${signal})` : ''}.`,
      });
      this.codexProcess = null;
      this.readline = null;
      this.activeTurn = false;
      this.account = null;
      this.threadId = null;
      this.isInitialized = false;
      this.#rejectAll(new Error(`Codex exited with code ${code}.`));
    });

    this.readline = readline.createInterface({
      input: this.codexProcess.stdout,
    });

    this.readline.on('line', (line) => {
      this.#handleLine(line);
    });
  }

  #handleLine(line) {
    if (!line.trim()) {
      return;
    }

    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      console.error('[codex parse error]', error, line);
      this.emit('event', {
        type: 'log',
        level: 'raw',
        message: line,
      });
      return;
    }

    if (typeof message.id !== 'undefined') {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }

      this.pending.delete(message.id);

      if (message.error) {
        const error = new Error(message.error.message ?? 'Codex RPC error');
        error.details = message.error;
        pending.reject(error);
        this.emit('event', {
          type: 'error',
          message: `Codex RPC error: ${message.error.message ?? 'Unknown error'}`,
          details: message.error,
        });
        return;
      }

      pending.resolve(message.result);
      return;
    }

    if (message.error) {
      console.error('[codex rpc error]', message.error);
      this.emit('event', {
        type: 'error',
        message: `Codex error: ${message.error.message ?? 'Unknown error'}`,
        details: message.error,
      });
      return;
    }

    this.#handleNotification(message);
  }

  #handleNotification(message) {
    const params = message.params ?? {};

    switch (message.method) {
      case 'item/agentMessage/delta':
        this.emit('event', {
          type: 'delta',
          delta: params.delta ?? '',
          itemId: params.itemId,
        });
        return;

      case 'item/completed':
        this.emit('event', {
          type: 'itemCompleted',
          item: params.item,
        });
        return;

      case 'turn/completed':
        this.activeTurn = false;
        this.emit('event', {
          type: 'turnCompleted',
          turn: params.turn,
          usage: params.usage,
        });
        return;

      case 'item/commandExecution/requestApproval':
        console.warn('[codex command approval requested]', params);
        this.emit('event', {
          type: 'approval',
          approvalType: 'command',
          params,
          message: 'Codex requested command approval.',
        });
        return;

      case 'item/fileChange/requestApproval':
        console.warn('[codex file approval requested]', params);
        this.emit('event', {
          type: 'approval',
          approvalType: 'fileChange',
          params,
          message: 'Codex requested file-change approval.',
        });
        return;

      case 'account/updated':
        this.emit('event', {
          type: 'accountUpdated',
          authMode: params.authMode,
          message: `Codex auth mode: ${params.authMode ?? 'unknown'}`,
        });
        return;

      case 'account/login/completed':
        this.emit('event', {
          type: 'accountLoginCompleted',
          params,
          message: 'Codex login completed.',
        });
        return;

      default:
        this.emit('event', {
          type: 'log',
          level: 'rpc',
          message: JSON.stringify(message),
        });
    }
  }

  async #ensureThread() {
    if (this.threadId) {
      return this.threadId;
    }

    const result = await this.#sendRequest('thread/start', {
      model: this.model,
      cwd: this.projectDir,
      serviceName: this.serviceName,
    });

    this.threadId = result?.thread?.id ?? null;

    if (!this.threadId) {
      throw new Error('Codex did not return a thread id.');
    }

    this.emit('event', {
      type: 'threadStarted',
      threadId: this.threadId,
      message: `Codex thread started: ${this.threadId}`,
    });

    return this.threadId;
  }

  #sendNotification(method, params) {
    this.#write({
      method,
      params,
    });
  }

  #sendRequest(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.#write({
        method,
        id,
        params,
      });
    });
  }

  #write(message) {
    if (!this.codexProcess || this.codexProcess.killed || !this.codexProcess.stdin.writable) {
      throw new Error('Codex process is not available.');
    }
    this.codexProcess.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #rejectAll(error) {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}

export function createCodexBridge() {
  const projectDir = path.resolve(import.meta.dirname, '..', '..');
  return new CodexBridge({ projectDir });
}
