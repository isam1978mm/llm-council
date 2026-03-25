"""Supabase-based storage for conversations."""

import os
from datetime import datetime
from typing import List, Dict, Any, Optional
from supabase import create_client, Client
from .config import DATA_DIR


def get_client() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    return create_client(url, key)


def create_conversation(conversation_id: str, user_id: str) -> Dict[str, Any]:
    """Create a new conversation owned by the given user."""
    conversation = {
        "id": conversation_id,
        "created_at": datetime.utcnow().isoformat(),
        "title": "New Conversation",
        "messages": [],
        "user_id": user_id,
    }

    get_client().table("conversations").insert(conversation).execute()
    return conversation


def get_conversation(conversation_id: str) -> Optional[Dict[str, Any]]:
    """Load a conversation from Supabase."""
    result = (
        get_client()
        .table("conversations")
        .select("*")
        .eq("id", conversation_id)
        .execute()
    )

    if not result.data:
        return None

    return result.data[0]


def save_conversation(conversation: Dict[str, Any]):
    """Save a conversation to Supabase."""
    get_client().table("conversations").upsert(conversation).execute()


def delete_conversation(conversation_id: str):
    """Delete a conversation from Supabase."""
    get_client().table("conversations").delete().eq("id", conversation_id).execute()


def search_conversations(query: str, user_id: str) -> List[Dict[str, Any]]:
    """Search conversations by title or message content."""
    import logging
    logger = logging.getLogger(__name__)

    q = query.strip().lower()
    client = get_client()

    # Query 1: search by title, scoped to user
    title_result = (
        client
        .table("conversations")
        .select("id, created_at, title, messages")
        .eq("user_id", user_id)
        .ilike("title", f"%{q}%")
        .order("created_at", desc=True)
        .execute()
    )
    logger.info(f"SEARCH title_result count={len(title_result.data)} for q={q!r}")

    # Query 2: fetch all conversations for this user, filter message content in Python
    all_result = (
        client
        .table("conversations")
        .select("id, created_at, title, messages")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    logger.info(f"SEARCH all_result count={len(all_result.data)}, first titles={[d.get('title') for d in all_result.data[:3]]}")
    logger.info(f"SEARCH sample messages structure={all_result.data[0].get('messages', [])[:1] if all_result.data else 'NO DATA'}")

    content_matches = [
        d for d in all_result.data
        if any(
            q in str(msg.get("content", "")).lower()
            for msg in d.get("messages", [])
            if msg.get("role") == "user"
        )
    ]
    logger.info(f"SEARCH content_matches count={len(content_matches)}")

    # Merge, deduplicate by id, preserve created_at order
    seen = set()
    merged = []
    for d in title_result.data + content_matches:
        if d["id"] not in seen:
            seen.add(d["id"])
            merged.append(d)
    merged.sort(key=lambda d: d["created_at"], reverse=True)

    return [
        {
            "id": d["id"],
            "created_at": d["created_at"],
            "title": d.get("title", "New Conversation"),
            "message_count": len(d["messages"]),
        }
        for d in merged
    ]


def list_conversations(user_id: str) -> List[Dict[str, Any]]:
    """List all conversations for the given user."""
    result = (
        get_client()
        .table("conversations")
        .select("id, created_at, title, messages")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )

    conversations = []
    for data in result.data:
        conversations.append({
            "id": data["id"],
            "created_at": data["created_at"],
            "title": data.get("title", "New Conversation"),
            "message_count": len(data["messages"])
        })

    return conversations


def add_user_message(conversation_id: str, content: str):
    """Add a user message to a conversation."""
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")

    conversation["messages"].append({
        "role": "user",
        "content": content
    })

    save_conversation(conversation)


def add_assistant_message(
    conversation_id: str,
    stage1: List[Dict[str, Any]],
    stage2: List[Dict[str, Any]],
    stage3: Dict[str, Any],
    stage4: Optional[List[Dict[str, Any]]] = None,
    stage5: Optional[Dict[str, Any]] = None,
    tldr: Optional[Dict[str, Any]] = None,
):
    """Add an assistant message with all stages to a conversation."""
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")

    conversation["messages"].append({
        "role": "assistant",
        "stage1": stage1,
        "stage2": stage2,
        "stage3": stage3,
        "stage4": stage4 or [],
        "stage5": stage5,
        "tldr": tldr,
    })

    save_conversation(conversation)


def update_conversation_title(conversation_id: str, title: str):
    """Update the title of a conversation."""
    get_client().table("conversations").update(
        {"title": title}
    ).eq("id", conversation_id).execute()


def record_model_appearances(models: list, rankings: list):
    """
    Record appearances and wins for all models after a council round.
    """
    client = get_client()

    for model in models:
        rank_entry = next((r for r in rankings if r["model"] == model), None)
        avg_rank = float(rank_entry["average_rank"]) if rank_entry else 0.0
        is_winner = rankings[0]["model"] == model if rankings else False

        result = client.table("model_stats").select("*").eq("model", model).execute()

        if result.data:
            existing = result.data[0]
            new_appearances = existing["total_appearances"] + 1
            new_wins = existing["wins"] + (1 if is_winner else 0)
            new_rank_points = float(existing["total_rank_points"]) + avg_rank
            new_avg_rank = round(new_rank_points / new_appearances, 2)
            new_win_rate = round(new_wins / new_appearances, 2)

            client.table("model_stats").update({
                "wins": new_wins,
                "total_appearances": new_appearances,
                "win_rate": new_win_rate,
                "avg_rank": new_avg_rank,
                "total_rank_points": new_rank_points,
                "last_updated": datetime.utcnow().isoformat()
            }).eq("model", model).execute()
        else:
            client.table("model_stats").insert({
                "model": model,
                "wins": 1 if is_winner else 0,
                "total_appearances": 1,
                "win_rate": 1.0 if is_winner else 0.0,
                "avg_rank": avg_rank,
                "total_rank_points": avg_rank,
                "last_updated": datetime.utcnow().isoformat()
            }).execute()


def list_presets() -> List[Dict[str, Any]]:
    """List all model presets."""
    try:
        result = get_client().table("model_presets").select("*").execute()
        return result.data or []
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"list_presets error: {e}")
        raise


def create_preset(name: str, council_models: List[str], chairman_model: str) -> Dict[str, Any]:
    """Create a new model preset, capping council_models at 3."""
    result = (
        get_client()
        .table("model_presets")
        .insert({
            "name": name,
            "models": {
                "council_models": council_models[:5],
                "chairman_model": chairman_model,
            },
        })
        .execute()
    )
    return result.data[0]


def delete_preset(preset_id: str) -> None:
    """Delete a model preset by id."""
    get_client().table("model_presets").delete().eq("id", preset_id).execute()


def get_model_stats() -> list:
    """Get all model stats sorted by win rate."""
    result = (
        get_client()
        .table("model_stats")
        .select("*")
        .order("win_rate", desc=True)
        .execute()
    )
    return result.data


def list_available_models() -> List[Dict[str, Any]]:
    """List active models from the Supabase-backed model catalog."""
    result = (
        get_client()
        .table("available_models")
        .select("*")
        .eq("is_active", True)
        .order("sort_order")
        .order("display_name")
        .execute()
    )
    return result.data or []


def list_all_available_models() -> List[Dict[str, Any]]:
    """List all models from the Supabase-backed model catalog."""
    result = (
        get_client()
        .table("available_models")
        .select("*")
        .order("sort_order")
        .order("display_name")
        .execute()
    )
    return result.data or []


def create_available_model(
    provider: str,
    model_key: str,
    display_name: str,
    description: Optional[str] = None,
    supports_council: bool = True,
    supports_chairman: bool = True,
    is_active: bool = True,
    is_free: Optional[bool] = None,
    sort_order: int = 0,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Create or update one model catalog row by model_key."""
    payload = {
        "provider": provider,
        "model_key": model_key,
        "display_name": display_name,
        "description": description,
        "supports_council": supports_council,
        "supports_chairman": supports_chairman,
        "is_active": is_active,
        "is_free": is_free,
        "sort_order": sort_order,
        "metadata": metadata or {},
        "updated_at": datetime.utcnow().isoformat(),
    }

    result = (
        get_client()
        .table("available_models")
        .upsert(payload, on_conflict="model_key")
        .execute()
    )
    return result.data[0]


def update_available_model(model_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    """Update one model catalog row by id."""
    payload = {
        key: value
        for key, value in updates.items()
        if key in {
            "display_name",
            "description",
            "supports_council",
            "supports_chairman",
            "is_active",
            "is_free",
            "sort_order",
            "metadata",
        }
    }
    payload["updated_at"] = datetime.utcnow().isoformat()

    result = (
        get_client()
        .table("available_models")
        .update(payload)
        .eq("id", model_id)
        .execute()
    )

    if not result.data:
        raise ValueError(f"Model {model_id} not found")

    return result.data[0]


def upsert_openrouter_models(models: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Upsert OpenRouter catalog rows without overwriting existing manual choices."""
    now = datetime.utcnow().isoformat()
    payload = []
    model_keys = [f"openrouter:{model.get('id')}" for model in models if model.get("id")]
    existing_rows = []

    if model_keys:
        existing_result = (
            get_client()
            .table("available_models")
            .select("*")
            .in_("model_key", model_keys)
            .execute()
        )
        existing_rows = existing_result.data or []

    existing_by_key = {row["model_key"]: row for row in existing_rows}

    for model in models:
        model_id = model.get("id")
        if not model_id:
            continue

        model_key = f"openrouter:{model_id}"
        existing = existing_by_key.get(model_key)
        is_free = _classify_openrouter_model_is_free(model)
        remote_description = model.get("description")
        remote_display_name = model.get("name") or model_id

        payload.append({
            "provider": "openrouter",
            "model_key": model_key,
            "display_name": existing.get("display_name") if existing else remote_display_name,
            "description": existing.get("description") if existing else remote_description,
            "supports_council": existing.get("supports_council", True) if existing else True,
            "supports_chairman": existing.get("supports_chairman", True) if existing else True,
            "is_active": existing.get("is_active", False) if existing else False,
            "is_free": is_free,
            "sort_order": existing.get("sort_order", 1000) if existing else 1000,
            "metadata": {
                "openrouter_id": model_id,
                "canonical_slug": model.get("canonical_slug"),
                "context_length": model.get("context_length"),
                "architecture": model.get("architecture"),
                "pricing": model.get("pricing"),
                "top_provider": model.get("top_provider"),
                "supported_parameters": model.get("supported_parameters"),
            },
            "updated_at": now,
        })

    if not payload:
        return []

    result = (
        get_client()
        .table("available_models")
        .upsert(payload, on_conflict="model_key")
        .execute()
    )
    return result.data or []


def _classify_openrouter_model_is_free(model: Dict[str, Any]) -> bool:
    """Classify an OpenRouter catalog model as free or paid."""
    pricing = model.get("pricing") or {}
    numeric_values = [
        pricing.get("prompt"),
        pricing.get("completion"),
        pricing.get("request"),
        pricing.get("image"),
        pricing.get("web_search"),
        pricing.get("input_cache_read"),
        pricing.get("input_cache_write"),
    ]
    parsed_values = [_parse_decimal_like(value) for value in numeric_values if value is not None]
    if parsed_values:
        return all(value == 0 for value in parsed_values)

    model_id = (model.get("id") or "").lower()
    canonical_slug = (model.get("canonical_slug") or "").lower()
    return model_id.endswith(":free") or canonical_slug.endswith(":free")


def _parse_decimal_like(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(str(value))
    except (TypeError, ValueError):
        return None
