"""Configuration for the LLM Council."""

import os
import json
from dotenv import load_dotenv

load_dotenv()

# OpenRouter API key
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

# OpenRouter API endpoint
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

# Data directory for conversation storage
DATA_DIR = "data/conversations"

# Config file for dynamic model settings
CONFIG_FILE = "data/council_config.json"

# Default models
DEFAULT_COUNCIL_MODELS = [
    "google/gemini-2.5-flash-lite",
    "deepseek/deepseek-chat-v3.1",
    "openai/gpt-5-mini",
]
DEFAULT_CHAIRMAN_MODEL = "openai/gpt-5-mini"
DEFAULT_DEBATE_ROUNDS = 2
DEFAULT_DEBATE_ROUNDS_CAP = 5


def load_config():
    """Load config from file, fallback to defaults."""
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r") as f:
            data = json.load(f)
        data.setdefault("debate_rounds", DEFAULT_DEBATE_ROUNDS)
        data.setdefault("debate_rounds_cap", DEFAULT_DEBATE_ROUNDS_CAP)
        return data
    return {
        "council_models": DEFAULT_COUNCIL_MODELS,
        "chairman_model": DEFAULT_CHAIRMAN_MODEL,
        "debate_rounds": DEFAULT_DEBATE_ROUNDS,
        "debate_rounds_cap": DEFAULT_DEBATE_ROUNDS_CAP,
    }


def save_config(council_models, chairman_model, debate_rounds=None, debate_rounds_cap=None):
    """Save config to file."""
    if debate_rounds is None:
        debate_rounds = DEFAULT_DEBATE_ROUNDS
    if debate_rounds_cap is None:
        debate_rounds_cap = DEFAULT_DEBATE_ROUNDS_CAP
    os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
    with open(CONFIG_FILE, "w") as f:
        json.dump({
            "council_models": council_models,
            "chairman_model": chairman_model,
            "debate_rounds": debate_rounds,
            "debate_rounds_cap": debate_rounds_cap,
        }, f)


# Load on startup
_config = load_config()
COUNCIL_MODELS = _config["council_models"]
CHAIRMAN_MODEL = _config["chairman_model"]
DEBATE_ROUNDS = _config["debate_rounds"]
DEBATE_ROUNDS_CAP = _config["debate_rounds_cap"]
