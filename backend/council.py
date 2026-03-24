"""4-stage LLM Council orchestration."""

import asyncio
import logging
from typing import List, Dict, Any, Tuple
from .openrouter import query_models_parallel, query_model
from .config import load_config
from . import storage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def stage1_collect_responses(user_query: str) -> List[Dict[str, Any]]:
    """
    Stage 1: Collect individual responses from all council models.
    """
    messages = [{"role": "user", "content": user_query}]

    responses = await query_models_parallel(load_config()["council_models"], messages)

    stage1_results = []
    for model, response in responses.items():
        if response is not None:
            stage1_results.append({
                "model": model,
                "response": response.get('content', '')
            })

    return stage1_results


async def stage2_collect_rankings(
    user_query: str,
    stage1_results: List[Dict[str, Any]]
) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    """
    Stage 2: Each model ranks the anonymized responses.
    """
    labels = [chr(65 + i) for i in range(len(stage1_results))]

    label_to_model = {
        f"Response {label}": result['model']
        for label, result in zip(labels, stage1_results)
    }

    responses_text = "\n\n".join([
        f"Response {label}:\n{result['response']}"
        for label, result in zip(labels, stage1_results)
    ])

    ranking_prompt = f"""You are evaluating different responses to the following question:

Question: {user_query}

Here are the responses from different models (anonymized):

{responses_text}

Your task:
1. First, evaluate each response individually. For each response, explain what it does well and what it does poorly.
2. Then, at the very end of your response, provide a final ranking.

IMPORTANT: Your final ranking MUST be formatted EXACTLY as follows:
- Start with the line "FINAL RANKING:" (all caps, with colon)
- Then list the responses from best to worst as a numbered list
- Each line should be: number, period, space, then ONLY the response label (e.g., "1. Response A")
- Do not add any other text or explanations in the ranking section

Example of the correct format for your ENTIRE response:

Response A provides good detail on X but misses Y...
Response B is accurate but lacks depth on Z...
Response C offers the most comprehensive answer...

FINAL RANKING:
1. Response C
2. Response A
3. Response B

Now provide your evaluation and ranking:"""

    messages = [{"role": "user", "content": ranking_prompt}]

    responses = await query_models_parallel(load_config()["council_models"], messages)

    stage2_results = []
    for model, response in responses.items():
        if response is not None:
            full_text = response.get('content', '')
            parsed = parse_ranking_from_text(full_text)
            stage2_results.append({
                "model": model,
                "ranking": full_text,
                "parsed_ranking": parsed
            })

    return stage2_results, label_to_model


async def stage3_synthesize_final(
    user_query: str,
    stage1_results: List[Dict[str, Any]],
    stage2_results: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Stage 3: Chairman synthesizes final response.
    """
    chairman_model = load_config()["chairman_model"]

    stage1_text = "\n\n".join([
        f"Model: {result['model']}\nResponse: {result['response']}"
        for result in stage1_results
    ])

    stage2_text = "\n\n".join([
        f"Model: {result['model']}\nRanking: {result['ranking']}"
        for result in stage2_results
    ])

    chairman_prompt = f"""You are the Chairman of an LLM Council. Multiple AI models have provided responses to a user's question, and then ranked each other's responses.

Original Question: {user_query}

STAGE 1 - Individual Responses:
{stage1_text}

STAGE 2 - Peer Rankings:
{stage2_text}

Your task as Chairman is to synthesize all of this information into a single, comprehensive, accurate answer to the user's original question. Consider:
- The individual responses and their insights
- The peer rankings and what they reveal about response quality
- Any patterns of agreement or disagreement

Provide a clear, well-reasoned final answer that represents the council's collective wisdom:"""

    messages = [{"role": "user", "content": chairman_prompt}]

    response = await query_model(chairman_model, messages)

    if response is None:
        return {
            "model": chairman_model,
            "response": "Error: Unable to generate final synthesis."
        }

    return {
        "model": chairman_model,
        "response": response.get('content', '')
    }


def parse_ranking_from_text(ranking_text: str) -> List[str]:
    """
    Parse the FINAL RANKING section from the model's response.
    """
    import re

    if "FINAL RANKING:" in ranking_text:
        parts = ranking_text.split("FINAL RANKING:")
        if len(parts) >= 2:
            ranking_section = parts[1]
            numbered_matches = re.findall(r'\d+\.\s*Response [A-Z]', ranking_section)
            if numbered_matches:
                return [re.search(r'Response [A-Z]', m).group() for m in numbered_matches]
            matches = re.findall(r'Response [A-Z]', ranking_section)
            return matches

    matches = re.findall(r'Response [A-Z]', ranking_text)
    return matches


def calculate_aggregate_rankings(
    stage2_results: List[Dict[str, Any]],
    label_to_model: Dict[str, str]
) -> List[Dict[str, Any]]:
    """
    Calculate aggregate rankings across all models.
    """
    from collections import defaultdict

    model_positions = defaultdict(list)

    for ranking in stage2_results:
        ranking_text = ranking['ranking']
        parsed_ranking = parse_ranking_from_text(ranking_text)

        for position, label in enumerate(parsed_ranking, start=1):
            if label in label_to_model:
                model_name = label_to_model[label]
                model_positions[model_name].append(position)

    aggregate = []
    for model, positions in model_positions.items():
        if positions:
            avg_rank = sum(positions) / len(positions)
            aggregate.append({
                "model": model,
                "average_rank": round(avg_rank, 2),
                "rankings_count": len(positions)
            })

    aggregate.sort(key=lambda x: x['average_rank'])

    return aggregate


def _build_debate_transcript(debate_history: List[Dict[str, Any]]) -> str:
    """Build a readable transcript of all previous debate rounds."""
    if not debate_history:
        return ""
    lines = []
    for entry in debate_history:
        lines.append(f"--- Round {entry['round']} ---")
        for msg in entry["messages"]:
            role_label = "DEFENDER" if msg["role"] == "defender" else "CHALLENGER"
            model_short = msg["model"].split("/")[-1]
            lines.append(f"[{role_label}] {model_short}:\n{msg['content']}\n")
    return "\n".join(lines)


def _defender_prompt(user_query: str, defender_answer: str, transcript: str, round_num: int) -> str:
    context = f"\n\nDebate so far:\n{transcript}\n" if transcript else ""
    return f"""You are participating in a structured debate about the following question:

Question: {user_query}

Your answer (ranked #1 by the council) was:
{defender_answer}{context}
Round {round_num} — DEFEND your answer.
Address any challenges raised and explain why your answer is the most accurate and comprehensive.
Be concise and specific (2-3 paragraphs maximum)."""


def _challenger_prompt(
    user_query: str,
    defender_answer: str,
    your_answer: str,
    transcript: str,
    round_num: int,
) -> str:
    context = f"\n\nDebate so far:\n{transcript}\n" if transcript else ""
    return f"""You are participating in a structured debate about the following question:

Question: {user_query}

The top-ranked answer (which you must challenge) was:
{defender_answer}

Your own answer was:
{your_answer}{context}
Round {round_num} — CHALLENGE the top-ranked answer.
Identify specific flaws, gaps, or inaccuracies, and explain where your answer is superior.
Be concise and specific (2-3 paragraphs maximum)."""


async def stage4_run_debate(
    user_query: str,
    stage1_results: List[Dict[str, Any]],
    aggregate_rankings: List[Dict[str, Any]],
    debate_rounds: int,
):
    """
    Stage 4: Debate mode. Top-ranked model defends, others challenge.
    Async generator — yields each completed round as {"round": N, "messages": [...]}.
    """
    if not aggregate_rankings or debate_rounds <= 0 or len(stage1_results) < 2:
        return

    defender_model = aggregate_rankings[0]["model"]
    defender_result = next((r for r in stage1_results if r["model"] == defender_model), None)
    if defender_result is None:
        return

    debate_history: List[Dict[str, Any]] = []

    for round_num in range(1, debate_rounds + 1):
        transcript = _build_debate_transcript(debate_history)

        tasks = []
        model_meta = []
        for result in stage1_results:
            model = result["model"]
            if model == defender_model:
                prompt = _defender_prompt(user_query, defender_result["response"], transcript, round_num)
                role = "defender"
            else:
                prompt = _challenger_prompt(
                    user_query,
                    defender_result["response"],
                    result["response"],
                    transcript,
                    round_num,
                )
                role = "challenger"
            tasks.append(query_model(model, [{"role": "user", "content": prompt}]))
            model_meta.append((model, role))

        responses = await asyncio.gather(*tasks)

        round_messages = []
        for (model, role), response in zip(model_meta, responses):
            if response is not None:
                round_messages.append({
                    "model": model,
                    "role": role,
                    "content": response.get("content", ""),
                })

        round_data = {"round": round_num, "messages": round_messages}
        debate_history.append(round_data)
        yield round_data


async def stage5_debate_verdict(
    user_query: str,
    stage1_results: List[Dict[str, Any]],
    stage4_results: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Stage 5: Chairman reviews the Stage 1 answers and Stage 4 debate transcript,
    then delivers a verdict on who won the debate and why.
    """
    chairman_model = load_config()["chairman_model"]

    stage1_text = "\n\n".join([
        f"Model: {result['model']}\nAnswer: {result['response']}"
        for result in stage1_results
    ])

    transcript = _build_debate_transcript(stage4_results)

    verdict_prompt = f"""You are the Chairman of an LLM Council. The council models have debated their answers to a user's question. Your task is to render a decisive verdict.

Original Question: {user_query}

STAGE 1 - Original Answers:
{stage1_text}

STAGE 4 - Debate Transcript:
{transcript}

Render your verdict by addressing the following:
1. **Winner**: Which model won the debate, and state clearly why.
2. **Strongest arguments**: What were the most compelling points made during the debate?
3. **Weaknesses exposed**: Were any flaws or gaps in the original answers revealed by the challengers?
4. **Final assessment**: Taking both the original answers and the debate into account, which model demonstrated the best overall reasoning?

Be specific — reference actual arguments from the debate transcript. Be decisive."""

    response = await query_model(chairman_model, [{"role": "user", "content": verdict_prompt}])

    if response is None:
        return {
            "model": chairman_model,
            "verdict": "Error: Unable to generate debate verdict."
        }

    return {
        "model": chairman_model,
        "verdict": response.get("content", ""),
    }


async def stage_tldr_summary(
    user_query: str,
    stage5_result: Dict[str, Any],
    stage4_results: List[Dict[str, Any]],
    stage3_result: Dict[str, Any],
) -> Dict[str, Any]:
    """
    TL;DR: Chairman produces a 3-5 bullet summary of the full council session.
    """
    chairman_model = load_config()["chairman_model"]

    verdict_text = stage5_result.get("verdict", "") if stage5_result else ""
    synthesis_text = stage3_result.get("response", "") if stage3_result else ""
    transcript = _build_debate_transcript(stage4_results)

    prompt = f"""You are the Chairman of an LLM Council. The council has completed a full session on a user's question. Generate a concise TL;DR summary in exactly 3-5 bullet points.

Original Question: {user_query}

Council Synthesis (Stage 3):
{synthesis_text}

Debate Transcript (Stage 4):
{transcript}

Debate Verdict (Stage 5):
{verdict_text}

Your TL;DR must cover:
- What the question was about
- The key disagreements that emerged in the debate
- Who won the debate and the decisive reason
- The final recommendation or takeaway

Rules:
- Return ONLY a markdown bullet list using "-" bullets. No headers, no intro sentence, no closing remarks.
- 3 to 5 bullets maximum.
- Each bullet should be one concise sentence."""

    response = await query_model(chairman_model, [{"role": "user", "content": prompt}])

    if response is None:
        return {"model": chairman_model, "bullets": "- Unable to generate summary."}

    return {
        "model": chairman_model,
        "bullets": response.get("content", "").strip(),
    }


async def generate_conversation_title(user_query: str) -> str:
    """
    Generate a short title for a conversation based on the first user message.
    """
    title_prompt = f"""Generate a very short title (3-5 words maximum) that summarizes the following question.
The title should be concise and descriptive. Do not use quotes or punctuation in the title.

Question: {user_query}

Title:"""

    messages = [{"role": "user", "content": title_prompt}]

    response = await query_model("google/gemini-2.5-flash", messages, timeout=30.0)

    if response is None:
        return "New Conversation"

    title = response.get('content', 'New Conversation').strip()
    title = title.strip('"\'')

    if len(title) > 50:
        title = title[:47] + "..."

    return title


async def run_full_council(user_query: str) -> Tuple[List, List, Dict, List, Dict]:
    """
    Run the complete 4-stage council process.
    """
    stage1_results = await stage1_collect_responses(user_query)

    if not stage1_results:
        return [], [], {
            "model": "error",
            "response": "All models failed to respond. Please try again."
        }, [], {}

    stage2_results, label_to_model = await stage2_collect_rankings(user_query, stage1_results)

    aggregate_rankings = calculate_aggregate_rankings(stage2_results, label_to_model)

    # Record model stats in Supabase
    logger.info(f"DEBUG: Recording stats for models: {[r['model'] for r in stage1_results]}")
    logger.info(f"DEBUG: aggregate_rankings: {aggregate_rankings}")
    try:
        all_models = [r["model"] for r in stage1_results]
        storage.record_model_appearances(all_models, aggregate_rankings)
        logger.info("DEBUG: Stats recorded successfully")
    except Exception as e:
        logger.exception(f"STATS ERROR: {e}")

    stage3_result = await stage3_synthesize_final(
        user_query,
        stage1_results,
        stage2_results
    )

    cfg = load_config()
    debate_rounds = cfg.get("debate_rounds", 2)
    stage4_results = []
    async for round_data in stage4_run_debate(user_query, stage1_results, aggregate_rankings, debate_rounds):
        stage4_results.append(round_data)

    stage5_result = None
    if stage4_results:
        stage5_result = await stage5_debate_verdict(user_query, stage1_results, stage4_results)

    tldr = await stage_tldr_summary(user_query, stage5_result, stage4_results, stage3_result)

    metadata = {
        "label_to_model": label_to_model,
        "aggregate_rankings": aggregate_rankings
    }

    return stage1_results, stage2_results, stage3_result, stage4_results, stage5_result, tldr, metadata
