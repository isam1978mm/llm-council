"""OpenRouter provider adapter."""

import httpx
import logging
from typing import List, Dict, Any, Optional
from .config import OPENROUTER_API_KEY, OPENROUTER_API_URL

logger = logging.getLogger(__name__)
OPENROUTER_MODELS_API_URL = "https://openrouter.ai/api/v1/models"


async def query_model(
    model: str,
    messages: List[Dict[str, str]],
    timeout: float = 120.0
) -> Optional[Dict[str, Any]]:
    """
    Query a single OpenRouter model.

    Args:
        model: OpenRouter model identifier without provider prefix
        messages: List of message dicts with 'role' and 'content'
        timeout: Request timeout in seconds

    Returns:
        Response dict with 'content' and optional 'reasoning_details', or None if failed
    """
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": model,
        "messages": messages,
    }

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                OPENROUTER_API_URL,
                headers=headers,
                json=payload
            )
            if response.status_code != 200:
                body_preview = response.text[:300]
                raise RuntimeError(f"HTTP {response.status_code}: {body_preview}")
            response.raise_for_status()

            data = response.json()
            choices = data.get('choices')
            if not choices:
                raise RuntimeError(f"No choices in response: {str(data)[:200]}")
            message = choices[0]['message']

            return {
                'content': message.get('content'),
                'reasoning_details': message.get('reasoning_details')
            }

    except Exception as e:
        logger.error("Error querying OpenRouter model %s: %s", model, e)
        raise


async def query_models_parallel(
    models: List[str],
    messages: List[Dict[str, str]]
) -> Dict[str, Optional[Dict[str, Any]]]:
    """
    Query multiple models in parallel.

    Args:
        models: List of OpenRouter model identifiers
        messages: List of message dicts to send to each model

    Returns:
        Dict mapping model identifier to response dict (or None if failed)
    """
    import asyncio

    # Create tasks for all models
    tasks = [query_model(model, messages) for model in models]

    # Wait for all to complete
    responses = await asyncio.gather(*tasks)

    # Map models to their responses
    return {model: response for model, response in zip(models, responses)}


async def list_models(timeout: float = 30.0) -> List[Dict[str, Any]]:
    """Fetch the OpenRouter model catalog."""
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(OPENROUTER_MODELS_API_URL, headers=headers)
            response.raise_for_status()
            data = response.json()
            return data.get("data", [])
    except Exception as e:
        logger.error("Error listing OpenRouter models: %s", e)
        raise
