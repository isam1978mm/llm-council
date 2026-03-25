"""FastAPI backend for LLM Council."""
import logging
import base64
import json as _json
from . import config as app_config
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import uuid
import json
import asyncio

from . import storage
from .council import run_full_council, generate_conversation_title, stage1_collect_responses, stage2_collect_rankings, stage3_synthesize_final, calculate_aggregate_rankings, stage4_run_debate, stage5_debate_verdict, stage_tldr_summary

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_user_id(authorization: Optional[str] = Header(None)) -> str:
    """Extract user ID from the Supabase JWT in the Authorization header."""
    logger.info(f"AUTH header received: {authorization!r}")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization token")
    token = authorization.split(" ", 1)[1]
    try:
        payload_b64 = token.split(".")[1]
        payload_b64 += "=" * (4 - len(payload_b64) % 4)
        data = _json.loads(base64.b64decode(payload_b64))
        return data["sub"]
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid authorization token")

app = FastAPI(title="LLM Council API")

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class CreateConversationRequest(BaseModel):
    """Request to create a new conversation."""
    pass


class SendMessageRequest(BaseModel):
    """Request to send a message in a conversation."""
    content: str


class ConversationMetadata(BaseModel):
    """Conversation metadata for list view."""
    id: str
    created_at: str
    title: str
    message_count: int


class Conversation(BaseModel):
    """Full conversation with all messages."""
    id: str
    created_at: str
    title: str
    messages: List[Dict[str, Any]]


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "service": "LLM Council API"}


@app.get("/api/conversations", response_model=List[ConversationMetadata])
async def list_conversations(user_id: str = Depends(get_user_id)):
    """List all conversations for the logged-in user."""
    return storage.list_conversations(user_id)


@app.post("/api/conversations", response_model=Conversation)
async def create_conversation(request: CreateConversationRequest, user_id: str = Depends(get_user_id)):
    """Create a new conversation owned by the logged-in user."""
    conversation_id = str(uuid.uuid4())
    conversation = storage.create_conversation(conversation_id, user_id)
    return conversation


@app.get("/api/conversations/search")
async def search_conversations(q: str = "", user_id: str = Depends(get_user_id)):
    """Search conversations by title or message content, scoped to the logged-in user."""
    if not q.strip():
        return []
    return storage.search_conversations(q, user_id)


@app.get("/api/conversations/{conversation_id}", response_model=Conversation)
async def get_conversation(conversation_id: str):
    """Get a specific conversation with all its messages."""
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    """Delete a conversation."""
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    storage.delete_conversation(conversation_id)
    return {"status": "ok"}


@app.patch("/api/conversations/{conversation_id}/title")
async def rename_conversation(conversation_id: str, data: dict):
    """Rename a conversation."""
    title = data.get("title", "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    storage.update_conversation_title(conversation_id, title)
    return {"status": "ok", "title": title}


@app.post("/api/conversations/{conversation_id}/message")
async def send_message(conversation_id: str, request: SendMessageRequest):
    """
    Send a message and run the 3-stage council process.
    Returns the complete response with all stages.
    """
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    is_first_message = len(conversation["messages"]) == 0
    storage.add_user_message(conversation_id, request.content)

    if is_first_message:
        title = await generate_conversation_title(request.content)
        storage.update_conversation_title(conversation_id, title)

    stage1_results, stage2_results, stage3_result, stage4_results, stage5_result, tldr, metadata = await run_full_council(
        request.content
    )

    storage.add_assistant_message(
        conversation_id,
        stage1_results,
        stage2_results,
        stage3_result,
        stage4_results,
        stage5_result,
        tldr,
    )

    return {
        "stage1": stage1_results,
        "stage2": stage2_results,
        "stage3": stage3_result,
        "stage4": stage4_results,
        "stage5": stage5_result,
        "tldr": tldr,
        "metadata": metadata
    }


@app.post("/api/conversations/{conversation_id}/message/stream")
async def send_message_stream(conversation_id: str, request: SendMessageRequest):
    """
    Send a message and stream the 3-stage council process.
    Returns Server-Sent Events as each stage completes.
    """
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    is_first_message = len(conversation["messages"]) == 0

    async def event_generator():
        try:
            storage.add_user_message(conversation_id, request.content)

            title_task = None
            if is_first_message:
                title_task = asyncio.create_task(generate_conversation_title(request.content))

            # Stage 1
            yield f"data: {json.dumps({'type': 'stage1_start'})}\n\n"
            stage1_results = await stage1_collect_responses(request.content)
            yield f"data: {json.dumps({'type': 'stage1_complete', 'data': stage1_results})}\n\n"

            # Stage 2
            yield f"data: {json.dumps({'type': 'stage2_start'})}\n\n"
            stage2_results, label_to_model = await stage2_collect_rankings(request.content, stage1_results)
            aggregate_rankings = calculate_aggregate_rankings(stage2_results, label_to_model)
            yield f"data: {json.dumps({'type': 'stage2_complete', 'data': stage2_results, 'metadata': {'label_to_model': label_to_model, 'aggregate_rankings': aggregate_rankings}})}\n\n"

            # ← NEW: Record model stats after Stage 2
            try:
                all_models = [r["model"] for r in stage1_results]
                storage.record_model_appearances(all_models, aggregate_rankings)
                logger.info(f"Stats recorded for models: {all_models}")
            except Exception as e:
                logger.exception(f"STATS ERROR: {e}")

            # Stage 3
            yield f"data: {json.dumps({'type': 'stage3_start'})}\n\n"
            stage3_result = await stage3_synthesize_final(request.content, stage1_results, stage2_results)
            yield f"data: {json.dumps({'type': 'stage3_complete', 'data': stage3_result})}\n\n"

            # Stage 4 (debate)
            cfg = app_config.load_config()
            debate_rounds = cfg.get("debate_rounds", 2)
            stage4_results = []
            if debate_rounds > 0 and len(stage1_results) >= 2:
                yield f"data: {json.dumps({'type': 'stage4_start'})}\n\n"
                async for round_data in stage4_run_debate(request.content, stage1_results, aggregate_rankings, debate_rounds):
                    stage4_results.append(round_data)
                    yield f"data: {json.dumps({'type': 'stage4_round_complete', 'data': round_data})}\n\n"
                yield f"data: {json.dumps({'type': 'stage4_complete'})}\n\n"

            # Stage 5 (debate verdict)
            stage5_result = None
            if stage4_results:
                yield f"data: {json.dumps({'type': 'stage5_start'})}\n\n"
                stage5_result = await stage5_debate_verdict(request.content, stage1_results, stage4_results)
                yield f"data: {json.dumps({'type': 'stage5_complete', 'data': stage5_result})}\n\n"

            # TL;DR summary
            yield f"data: {json.dumps({'type': 'tldr_start'})}\n\n"
            tldr = await stage_tldr_summary(request.content, stage5_result, stage4_results, stage3_result)
            yield f"data: {json.dumps({'type': 'tldr_complete', 'data': tldr})}\n\n"

            if title_task:
                title = await title_task
                storage.update_conversation_title(conversation_id, title)
                yield f"data: {json.dumps({'type': 'title_complete', 'data': {'title': title}})}\n\n"

            storage.add_assistant_message(
                conversation_id,
                stage1_results,
                stage2_results,
                stage3_result,
                stage4_results,
                stage5_result,
                tldr,
            )

            yield f"data: {json.dumps({'type': 'complete'})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@app.get("/api/config")
async def get_config():
    """Get current council configuration."""
    cfg = app_config.load_config()
    return cfg


@app.post("/api/config")
async def update_config(data: dict):
    """Update council models configuration."""
    council_models = app_config.normalize_model_specs(data.get("council_models", app_config.DEFAULT_COUNCIL_MODELS))
    chairman_model = app_config.normalize_model_spec(data.get("chairman_model", app_config.DEFAULT_CHAIRMAN_MODEL))
    debate_rounds_cap = data.get("debate_rounds_cap", app_config.DEBATE_ROUNDS_CAP)
    debate_rounds = max(1, min(int(data.get("debate_rounds", app_config.DEFAULT_DEBATE_ROUNDS)), int(debate_rounds_cap)))

    app_config.save_config(council_models, chairman_model, debate_rounds, debate_rounds_cap)

    app_config.COUNCIL_MODELS = council_models
    app_config.CHAIRMAN_MODEL = chairman_model
    app_config.DEBATE_ROUNDS = debate_rounds
    app_config.DEBATE_ROUNDS_CAP = debate_rounds_cap

    return {"status": "ok", "council_models": council_models, "chairman_model": chairman_model, "debate_rounds": debate_rounds, "debate_rounds_cap": debate_rounds_cap}


@app.get("/api/presets")
async def list_presets():
    """List all model presets."""
    try:
        return storage.list_presets()
    except Exception as e:
        logger.error(f"Failed to list presets: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load presets: {str(e)}")


@app.post("/api/presets")
async def create_preset(data: dict):
    """Save current models as a named preset."""
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Preset name cannot be empty")
    council_models = app_config.normalize_model_specs(data.get("council_models", [])[:5])
    chairman_model = app_config.normalize_model_spec(data.get("chairman_model", "").strip())
    if not council_models:
        raise HTTPException(status_code=400, detail="At least one council model is required")
    return storage.create_preset(name, council_models, chairman_model)


@app.delete("/api/presets/{preset_id}")
async def delete_preset(preset_id: str):
    """Delete a model preset."""
    storage.delete_preset(preset_id)
    return {"status": "ok"}


@app.get("/api/stats")
async def get_stats():
    """Get model performance stats."""
    from . import storage
    return storage.get_model_stats()


@app.get("/api/models")
async def list_available_models():
    """List available active models from the catalog."""
    try:
        return storage.list_available_models()
    except Exception as e:
        logger.error(f"Failed to list available models: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load models: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
