# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Run everything (recommended):**
```bash
./start.sh
```

**Backend only** (from project root):
```bash
uv run python -m backend.main
```

**Frontend only:**
```bash
cd frontend && npm run dev
```

**Frontend lint:**
```bash
cd frontend && npm run lint
```

**Test OpenRouter connectivity:**
```bash
uv run python test_openrouter.py
```

## Environment Setup

Create `.env` in the project root with:
```
OPENROUTER_API_KEY=sk-or-v1-...
SUPABASE_URL=https://...
SUPABASE_KEY=...
```

`SUPABASE_URL` and `SUPABASE_KEY` are required — storage.py uses Supabase (not local JSON). The Supabase instance needs two tables: `conversations` and `model_stats`.

## Architecture

### 3-Stage Council Flow

```
User Query
    ↓
Stage 1: Parallel queries → [individual responses per model]
    ↓
Stage 2: Anonymize responses (A/B/C...) → parallel ranking queries → [evaluations + parsed rankings]
    ↓
Aggregate Rankings Calculation → [sorted by avg position]
    ↓
Stage 3: Chairman synthesis with full context
    ↓
Return: {stage1, stage2, stage3, metadata}
```

The entire flow is async/parallel where possible. `label_to_model` metadata is ephemeral — returned by the API but not persisted.

### Backend (`backend/`)

- **`config.py`**: Loads/saves council config to `data/council_config.json`. Defaults to `DEFAULT_COUNCIL_MODELS` and `DEFAULT_CHAIRMAN_MODEL` if no config file exists. Council models and chairman are configurable at runtime via `/api/config`.
- **`openrouter.py`**: Async HTTP to OpenRouter. `query_model()` for single model, `query_models_parallel()` uses `asyncio.gather()`. Returns `None` on failure (graceful degradation).
- **`council.py`**: Core logic. `stage1_collect_responses()`, `stage2_collect_rankings()`, `stage3_synthesize_final()`. Stage 2 anonymizes responses as "Response A/B/C..." and returns a `(rankings_list, label_to_model_dict)` tuple. `parse_ranking_from_text()` extracts "FINAL RANKING:" sections.
- **`storage.py`**: Supabase-backed. Stores conversations in `conversations` table, model performance stats in `model_stats` table. `record_model_appearances()` tracks wins and average rank after each council round.
- **`main.py`**: FastAPI on port 8001. Two message endpoints: `/message` (batch) and `/message/stream` (SSE). Stats recorded after Stage 2 in the streaming path. Config endpoints at `/api/config` (GET/POST).

### Frontend (`frontend/src/`)

- **`App.jsx`**: Top-level state. Manages conversations list, current conversation, and ephemeral metadata (label_to_model, aggregate_rankings). Uses SSE streaming endpoint.
- **`components/ChatInterface.jsx`**: Textarea input — Enter to send, Shift+Enter for newline.
- **`components/Stage1.jsx`**: Tab view of individual model responses with ReactMarkdown.
- **`components/Stage2.jsx`**: Tab view of raw evaluations. De-anonymization is client-side (bold model names for readability). Shows "Extracted Ranking" for validation and aggregate rankings with avg position.
- **`components/Stage3.jsx`**: Chairman's final answer, green-tinted background.
- **`Settings.jsx`**: Modal for editing council models and chairman. Calls `/api/config` to save. Changes take effect immediately in backend.
- **`Leaderboard.jsx`**: Reads from `/api/stats` to display historical model win rates and average rankings.
- **`api.js`**: API base URL from `VITE_API_URL` env var, falls back to `http://localhost:8001`.

### Key Implementation Details

**Relative imports**: All backend modules use relative imports (`from .config import ...`). Always run as `python -m backend.main` from the project root, never from the `backend/` directory.

**Stage 2 prompt format**: Requires "FINAL RANKING:" header followed by a numbered list (`1. Response C`, `2. Response A`, etc.). Fallback regex handles non-conforming output.

**ReactMarkdown**: All `<ReactMarkdown>` must be wrapped in `<div className="markdown-content">` for spacing (defined in `index.css`).

**Port config**: Backend on 8001, frontend on 5173. To change, update both `backend/main.py` and `frontend/src/api.js`.

**Streaming**: The primary message path uses SSE (`/message/stream`). Events: `stage1_start`, `stage1_complete`, `stage2_start`, `stage2_complete`, `stage3_start`, `stage3_complete`, `title_complete`, `complete`, `error`.
