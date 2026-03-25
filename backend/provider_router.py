"""Provider router for model execution."""

import asyncio
import logging
from typing import Any, Dict, List, Optional, Tuple

from . import codex_provider, openrouter
from .config import normalize_model_spec

logger = logging.getLogger(__name__)


def split_model_spec(model_spec: str) -> Tuple[str, str, str]:
    """Return (normalized_spec, provider, provider_model)."""
    normalized = normalize_model_spec(model_spec)
    provider, provider_model = normalized.split(":", 1)
    return normalized, provider, provider_model


async def query_model(
    model_spec: str,
    messages: List[Dict[str, str]],
    timeout: float = 120.0,
) -> Optional[Dict[str, Any]]:
    """Query a single model through the configured provider."""
    normalized, provider, provider_model = split_model_spec(model_spec)

    logger.info("MODEL_CALL START model=%s provider=%s timeout=%.1fs", normalized, provider, timeout)

    try:
        if provider == "openrouter":
            response = await asyncio.wait_for(
                openrouter.query_model(provider_model, messages, timeout=timeout),
                timeout=timeout,
            )
        elif provider == "codex":
            response = await asyncio.wait_for(
                codex_provider.query_model(provider_model, messages, timeout=timeout),
                timeout=timeout,
            )
        else:
            raise ValueError(f"Unsupported provider '{provider}' for model '{normalized}'")
    except asyncio.TimeoutError:
        logger.error("MODEL_CALL FAIL model=%s provider=%s reason=timeout", normalized, provider)
        return None
    except Exception as exc:
        logger.exception("MODEL_CALL FAIL model=%s provider=%s reason=%s", normalized, provider, exc)
        return None

    if response is None:
        logger.warning("MODEL_CALL FAIL model=%s provider=%s reason=none", normalized, provider)
        return None

    logger.info(
        "MODEL_CALL DONE model=%s provider=%s chars=%s",
        normalized,
        provider,
        len(response.get("content") or ""),
    )
    return response


async def query_models_parallel(
    models: List[str],
    messages: List[Dict[str, str]],
) -> Dict[str, Optional[Dict[str, Any]]]:
    """Query multiple provider-backed models in parallel."""
    normalized_models = [split_model_spec(model)[0] for model in models]
    tasks = [query_model(model, messages) for model in normalized_models]
    responses = await asyncio.gather(*tasks)
    return {
        model: response
        for model, response in zip(normalized_models, responses)
    }
