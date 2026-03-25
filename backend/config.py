"""Configuration for the LLM Council."""

import json
import os
from dotenv import load_dotenv

load_dotenv()

DEFAULT_PROVIDER = "openrouter"

# OpenRouter API key
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

# OpenRouter API endpoint
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

# Default Codex-backed model used for the local provider alias.
CODEX_DEFAULT_MODEL = os.getenv("CODEX_DEFAULT_MODEL", "gpt-5.4")

# Data directory for conversation storage
DATA_DIR = "data/conversations"

# Config file for dynamic model settings
CONFIG_FILE = "data/council_config.json"


def normalize_model_spec(model: str, default_provider: str = DEFAULT_PROVIDER) -> str:
    """Normalize a model spec to provider:model form while keeping old values working."""
    value = str(model or "").strip()
    if not value:
        return value

    if ":" in value:
        provider, target = value.split(":", 1)
        provider = provider.strip().lower()
        target = target.strip()
        if provider and target:
            return f"{provider}:{target}"

    return f"{default_provider}:{value}"


def normalize_model_specs(models) -> list[str]:
    """Normalize a list of configured model specs."""
    normalized = []
    for model in models or []:
        value = normalize_model_spec(model)
        if value:
            normalized.append(value)
    return normalized


# Default models
DEFAULT_COUNCIL_MODELS = normalize_model_specs([
    "google/gemini-2.5-flash-lite",
    "deepseek/deepseek-chat-v3.1",
    "openai/gpt-5-mini",
])
DEFAULT_CHAIRMAN_MODEL = normalize_model_spec("openai/gpt-5-mini")
DEFAULT_DEBATE_ROUNDS = 2
DEFAULT_DEBATE_ROUNDS_CAP = 5


def _normalize_config(data: dict | None) -> dict:
    cfg = dict(data or {})
    cfg["council_models"] = normalize_model_specs(cfg.get("council_models", DEFAULT_COUNCIL_MODELS))
    cfg["chairman_model"] = normalize_model_spec(cfg.get("chairman_model", DEFAULT_CHAIRMAN_MODEL))
    cfg.setdefault("debate_rounds", DEFAULT_DEBATE_ROUNDS)
    cfg.setdefault("debate_rounds_cap", DEFAULT_DEBATE_ROUNDS_CAP)
    return cfg


def load_config():
    """Load config from file, fallback to defaults."""
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return _normalize_config(data)

    return _normalize_config({
        "council_models": DEFAULT_COUNCIL_MODELS,
        "chairman_model": DEFAULT_CHAIRMAN_MODEL,
        "debate_rounds": DEFAULT_DEBATE_ROUNDS,
        "debate_rounds_cap": DEFAULT_DEBATE_ROUNDS_CAP,
    })


def save_config(council_models, chairman_model, debate_rounds=None, debate_rounds_cap=None):
    """Save config to file."""
    if debate_rounds is None:
        debate_rounds = DEFAULT_DEBATE_ROUNDS
    if debate_rounds_cap is None:
        debate_rounds_cap = DEFAULT_DEBATE_ROUNDS_CAP

    config = _normalize_config({
        "council_models": council_models,
        "chairman_model": chairman_model,
        "debate_rounds": debate_rounds,
        "debate_rounds_cap": debate_rounds_cap,
    })

    os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f)


# Load on startup
_config = load_config()
COUNCIL_MODELS = _config["council_models"]
CHAIRMAN_MODEL = _config["chairman_model"]
DEBATE_ROUNDS = _config["debate_rounds"]
DEBATE_ROUNDS_CAP = _config["debate_rounds_cap"]
