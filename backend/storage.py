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


def create_conversation(conversation_id: str) -> Dict[str, Any]:
    """Create a new conversation."""
    conversation = {
        "id": conversation_id,
        "created_at": datetime.utcnow().isoformat(),
        "title": "New Conversation",
        "messages": []
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


def list_conversations() -> List[Dict[str, Any]]:
    """List all conversations (metadata only)."""
    result = (
        get_client()
        .table("conversations")
        .select("id, created_at, title, messages")
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
    stage3: Dict[str, Any]
):
    """Add an assistant message with all 3 stages to a conversation."""
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")

    conversation["messages"].append({
        "role": "assistant",
        "stage1": stage1,
        "stage2": stage2,
        "stage3": stage3
    })

    save_conversation(conversation)


def update_conversation_title(conversation_id: str, title: str):
    """Update the title of a conversation."""
    get_client().table("conversations").update(
        {"title": title}
    ).eq("id", conversation_id).execute()
