"""
backend/agents/trading_floor.py

Hybrid Execution Engine — Hierarchical Agent Swarm

Debate participants:
  • retail     (llama-3.1-8b-instant on mock / openai/gpt-oss-120b on live)
  • whale      (openai/gpt-oss-120b + function-calling on live)
  • contrarian (openai/gpt-oss-120b + function-calling on live)
  • synthesis  (openai/gpt-oss-120b — orchestrates final signal, calls yfinance + Neo4j)

Mock path  → _run_agent_turn       (fast deterministic stream, no LLM tool-calls)
Live path  → _run_agent_turn_live  (manual 2-call function-calling loop)

MOCK_EVENTS: events that use the mock path by default (safe for demo)
Any other event string uses the live agent path.
"""
from __future__ import annotations

import json
import logging
import asyncio
from typing import TypedDict, Annotated, Callable, Awaitable, Any
import operator

from langgraph.graph import StateGraph, END
from groq import AsyncGroq

from backend.core.config import get_settings
from backend.core.key_manager import (
    get_groq_client,
    report_groq_error,
    report_groq_success,
)
from backend.mcp_server.tools.read_tools import (
    execute_graphrag_query,
    fetch_et_news_mock,
    fetch_et_news,
    get_nse_price_mock,
    get_nse_price,
    run_pattern_backtest,
    run_pattern_backtest_mock,
)
from backend.mcp_server.tools.write_tools import append_causal_link
from backend.middleware.thought_policeman import ThoughtPoliceman

logger = logging.getLogger(__name__)

LLM_REQUEST_COUNT = 0

# ─── Model IDs ──────────────────────────────────────────────────────────────
MODEL_LIVE_REASONING = "openai/gpt-oss-120b"   # main agents + synthesis (live path)
MODEL_FAST_STREAM    = "llama-3.3-70b-versatile" # mock path streaming
MODEL_MIDDLEWARE     = "llama-3.1-8b-instant"   # thought policeman / graphrag

# ─── Mock event detection ────────────────────────────────────────────────────
MOCK_EVENTS = [
    "transport strike in gujarat",
    "hosur factory strike",
    "cyclone warning",
]

def _is_mock_event(topic: str) -> bool:
    t = topic.lower().strip()
    return any(m in t for m in MOCK_EVENTS)

MAX_TURNS = 1


# ─── LangGraph State ─────────────────────────────────────────────────────────

class DebateState(TypedDict):
    messages:             Annotated[list[dict], operator.add]
    topic:                str
    current_speaker:      str
    turn_count:           int
    graph_context:        dict
    hallucination_detected: bool
    mcp_tool_called:      str
    final_signal:         dict
    causal_chain:         list[dict]
    stock_charts:         dict   # ticker → ohlcv list


# ─── Groq client factory ─────────────────────────────────────────────────────

def _groq_client() -> AsyncGroq:
    """Returns a fresh AsyncGroq client from the key-rotation pool."""
    return get_groq_client()


# ─── Streaming helpers ───────────────────────────────────────────────────────

async def _stream_groq(system: str, user: str, model: str = MODEL_FAST_STREAM,
                       max_tokens: int = 512):
    """Yields text chunks from Groq streaming. Rotates to a fresh key on each 429 retry."""
    for attempt in range(3):
        client = get_groq_client()   # fresh key each attempt
        used_key = client.api_key
        try:
            global LLM_REQUEST_COUNT
            LLM_REQUEST_COUNT += 1
            print(f"[{LLM_REQUEST_COUNT}] 🚀 [Groq Request] model={model} (Stream)")
            stream = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user",   "content": user},
                ],
                temperature=0.75,
                max_tokens=max_tokens,
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta.content or ""
                if delta:
                    yield delta
            report_groq_success(used_key)
            return  # success — exit retry loop
        except Exception as e:
            err_str = str(e)
            if "429" in err_str and attempt < 2:
                # 429 = rate-limit, not a key failure — just back off and rotate
                wait = (attempt + 1) * 8
                logger.warning(f"[_stream_groq] 429 rate-limit, retrying in {wait}s...")
                print(f"\n[Groq] ⚡ Rate-limited, cooling down {wait}s...")
                await asyncio.sleep(wait)
            else:
                report_groq_error(used_key)
                logger.error(f"[_stream_groq] failed: {e}")
                yield f"\n[System Error: LLM stream failed — {e}]"
                return


async def _collect_groq(system: str, user: str,
                         model: str = MODEL_LIVE_REASONING,
                         max_tokens: int = 1024,
                         reasoning_effort: str | None = None) -> str:
    """Collects a full (non-streaming) response from Groq. Rotates key on each 429 retry."""
    kwargs: dict[str, Any] = dict(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
        temperature=0.7,
        max_tokens=max_tokens,
    )
    if reasoning_effort:
        kwargs["reasoning_effort"] = reasoning_effort
    for attempt in range(3):
        client = get_groq_client()   # fresh key each attempt
        used_key = client.api_key
        try:
            global LLM_REQUEST_COUNT
            LLM_REQUEST_COUNT += 1
            print(f"[{LLM_REQUEST_COUNT}] 🚀 [Groq Request] model={model} (Collect)")
            response = await client.chat.completions.create(**kwargs)
            report_groq_success(used_key)
            return response.choices[0].message.content.strip()
        except Exception as e:
            if "429" in str(e) and attempt < 2:
                # 429 = rate-limit, not a key failure — rotate and retry
                wait = (attempt + 1) * 10
                logger.warning(f"[_collect_groq] 429 rate-limit, retrying in {wait}s...")
                print(f"\n[Groq] ⚡ Rate-limited, cooling down {wait}s...")
                await asyncio.sleep(wait)
            else:
                report_groq_error(used_key)
                raise


# ─── In-memory broadcast queues ──────────────────────────────────────────────

_active_queues: list[asyncio.Queue] = []


def register_queue(q: asyncio.Queue):
    _active_queues.append(q)


def unregister_queue(q: asyncio.Queue):
    if q in _active_queues:
        _active_queues.remove(q)


async def _broadcast(message: dict):
    for q in list(_active_queues):
        try:
            q.put_nowait(message)
        except asyncio.QueueFull:
            pass


# ─── Persona system prompts ──────────────────────────────────────────────────

RETAIL_SYSTEM = """You are "Ravi" – an enthusiastic retail trader on Zerodha.
You believe any local disruption is a massive opportunity. You talk about momentum,
delivery volumes, and social media sentiment. Write out your analysis fully in 3-4 natural sentences. DO NOT output single word abbreviations like 'ns' or 'nt'. Always mention at least one NSE ticker symbol."""

WHALE_SYSTEM = """You are "The Whale" – an institutional fund manager handling ₹5,000 Cr.
You rely on supply-chain data, sector rotation models, and macro positioning.
You always cite quantitative data from the graph. Write out your analysis fully in 3-4 natural analytical sentences. DO NOT output single word abbreviations."""

CONTRARIAN_SYSTEM = """You are "Vikram" – a contrarian trader who profits from reversals.
You challenge consensus, look for the opposite trade, and highlight structural headwinds.
Write out your analysis fully in 3-4 natural contrarian sentences. Disagree with the last speaker and justify with data. DO NOT output single word abbreviations."""

SYNTHESIS_SYSTEM = """You are the "Synthesis Agent" — you read the full debate and surface a
final objective trading signal. Produce ONLY valid JSON (no markdown) with these keys:
  CONSENSUS: BULLISH | BEARISH | NEUTRAL
  CONFIDENCE_PCT: integer 0-100
  PRIMARY_TICKER: top NSE ticker
  SECONDARY_TICKERS: list of up to 3 NSE tickers
  TIME_HORIZON: intraday | swing | positional
  CAUSAL_GRAPH: list of causal link objects (minimum 5 links — see rules and example below)
  RATIONALE: 2-sentence summary

CAUSAL_GRAPH rules:
  - Each object must have: source, relationship, target, tier, confidence
  - relationship must be SCREAMING_SNAKE_CASE from: DISRUPTS, DELAYS, IMPACTS, SUPPLY_CHAIN_RISK, RIPPLES
  - tier must be an integer 1, 2, or 3 — NEVER a string
  - confidence must be a float 0.0-1.0 — NEVER a percentage string
  - Tier 1 = event actor → disrupted entity, Tier 2 = disrupted entity → NSE ticker, Tier 3 = ticker → downstream ticker/sector

Few-shot example output (replace with values relevant to the actual event):
{
  "CONSENSUS": "BEARISH",
  "CONFIDENCE_PCT": 72,
  "PRIMARY_TICKER": "ADANIPORTS",
  "SECONDARY_TICKERS": ["CONCOR", "MAHLOG"],
  "TIME_HORIZON": "swing",
  "CAUSAL_GRAPH": [
    {"source": "Transport Strike", "relationship": "DISRUPTS", "target": "Gujarat Logistics", "tier": 1, "confidence": 0.88},
    {"source": "Gujarat Logistics", "relationship": "DELAYS", "target": "ADANIPORTS", "tier": 2, "confidence": 0.72},
    {"source": "Gujarat Logistics", "relationship": "IMPACTS", "target": "GUJGASLTD", "tier": 2, "confidence": 0.68},
    {"source": "ADANIPORTS", "relationship": "SUPPLY_CHAIN_RISK", "target": "CONCOR", "tier": 3, "confidence": 0.61},
    {"source": "GUJGASLTD", "relationship": "RIPPLES", "target": "IGL", "tier": 3, "confidence": 0.55}
  ],
  "RATIONALE": "The transport strike cascades through Gujarat logistics into port and gas distribution stocks. Bearish pressure on ADANIPORTS and GUJGASLTD expected over 3-5 day swing horizon."
}

Return ONLY the raw JSON object starting directly with the opening curly brace, no markdown, no explanation."""


# ─── Tool JSON schemas for openai/gpt-oss-120b function-calling ─────────────

RETAIL_TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "get_nse_price",
            "description": "Get current NSE stock price and 30-day OHLCV chart data (mock).",
            "parameters": {
                "type": "object",
                "properties": {
                    "ticker": {"type": "string", "description": "NSE ticker symbol, e.g. ADANIPORTS"}
                },
                "required": ["ticker"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_et_news",
            "description": "Search Economic Times for recent news about a market topic.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Market event or ticker to search for"},
                    "timeframe": {"type": "string", "description": "Lookback window, e.g. 7d", "default": "7d"},
                },
                "required": ["query"],
            },
        },
    },
]

WHALE_CONTRARIAN_TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "get_nse_price",
            "description": "Fetch LIVE NSE/BSE stock OHLCV data from Yahoo Finance (yfinance).",
            "parameters": {
                "type": "object",
                "properties": {
                    "ticker": {"type": "string", "description": "NSE ticker, e.g. ADANIPORTS"}
                },
                "required": ["ticker"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_et_news",
            "description": (
                "Fetch LIVE Economic Times news via a triple-tier fallback pipeline: "
                "(1) NewsData.io REST API targeting economictimes.indiatimes.com, "
                "(2) groq/compound autonomous web-browsing sub-agent, "
                "(3) deterministic mock data. "
                "CRITICAL QUERY FORMAT: Pass CONCISE keyword phrases (2-4 words max), "
                "NOT full sentences. Good: 'Ashok Leyland strike', 'ADANIPORTS port delay', "
                "'SEBI margin rules'. Bad: 'What is happening with Ashok Leyland factory strike today?'. "
                "Short keyword queries maximise NewsData.io API search hits."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query":    {"type": "string", "description": "Concise 2-4 word keyword query, e.g. 'ADANIPORTS port disruption'"},
                    "timeframe": {"type": "string", "default": "7d", "description": "Lookback window e.g. 7d, 3d"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_pattern_backtest",
            "description": "Run historical pattern backtest for a chart pattern on an NSE ticker.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "e.g. bull flag, head and shoulders"},
                    "ticker":  {"type": "string"},
                },
                "required": ["pattern", "ticker"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "execute_graphrag_query",
            "description": (
                "Query the Neo4j AuraDB supply-chain knowledge graph. Returns a LOCALIZED "
                "sub-graph (1st + 2nd degree) relevant to the query. Do NOT use to dump full DB."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "unstructured_query": {"type": "string"}
                },
                "required": ["unstructured_query"],
            },
        },
    },
]

SYNTHESIS_TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "get_nse_price",
            "description": "Fetch live OHLCV chart data for an NSE ticker (for broadcasting stock charts to UI).",
            "parameters": {
                "type": "object",
                "properties": {
                    "ticker": {"type": "string"}
                },
                "required": ["ticker"],
            },
        },
    },
    # NOTE: append_causal_link is intentionally NOT exposed via tool schema to other agents.
    # The Synthesis node calls it directly in code after parsing the signal JSON.
]


# ─── Local tool dispatch table ────────────────────────────────────────────────

async def _dispatch_tool(tool_name: str, tool_args: dict) -> Any:
    """Execute a tool locally and return its result dict."""
    dispatch = {
        # Mock read tools (retail path)
        "get_nse_price_mock":      lambda a: get_nse_price_mock(**a),
        "fetch_et_news_mock":      lambda a: fetch_et_news_mock(**a),
        # Live read tools (whale/contrarian path)
        "get_nse_price":           lambda a: get_nse_price(**a),
        "fetch_et_news":           lambda a: fetch_et_news(**a),
        "run_pattern_backtest":    lambda a: run_pattern_backtest(**a),
        "execute_graphrag_query":  lambda a: execute_graphrag_query(**a),
    }
    handler = dispatch.get(tool_name)
    if not handler:
        return {"error": f"Unknown tool: {tool_name}"}
    result = handler(tool_args)
    if asyncio.iscoroutine(result):
        return await result
    return result


# ═══════════════════════════════════════════════════════════════════════════
# MOCK PATH — Fast streaming turn (existing logic, kept intact)
# ═══════════════════════════════════════════════════════════════════════════

async def _run_agent_turn(
    state: DebateState,
    persona_key: str,
    persona_name: str,
    system_prompt: str,
    use_graph_tool: bool = False,
) -> DebateState:
    """Mock-path agent turn — streams from llama-3.3-70b-versatile."""
    logger.info(f"[MOCK] 🎙 STARTING TURN: {persona_name}")
    print(f"\n[LANGGRAPH MOCK] Node: {persona_name}")

    topic = state["topic"]
    history = "\n".join(f"[{m['speaker']}]: {m['content']}" for m in state["messages"][-6:])
    graph_ctx = json.dumps(state.get("graph_context", {}), indent=2)[:800]

    if use_graph_tool and not state.get("graph_context"):
        try:
            ctx = await execute_graphrag_query(topic)
            state = {**state, "graph_context": ctx}
            await _broadcast({"type": "mcp_tool", "tool": "execute_graphrag_query", "data": ctx})
        except Exception as exc:
            logger.warning(f"GraphRAG mock path error: {exc}")

    user_prompt = (
        f"Event: {topic}\n\nRecent Debate:\n{history}\n\n"
        f"GraphRAG Context:\n{graph_ctx}\n\nNow give YOUR perspective as {persona_name}."
    )

    buffer = ""
    token_count = 0
    policeman = ThoughtPoliceman()
    hallucination_triggered = False

    await _broadcast({"type": "speaker_change", "speaker": persona_key})
    await asyncio.sleep(0.05)

    async def on_hallucination():
        nonlocal hallucination_triggered
        hallucination_triggered = True
        await _broadcast({"type": "hallucination_detected", "speaker": persona_key})
        news = fetch_et_news_mock(query=topic)
        await _broadcast({"type": "mcp_tool", "tool": "fetch_et_news_mock", "data": news})

    try:
        # ── Collect full response internally (no per-token WS broadcast) ──
        await asyncio.sleep(2) # Artificial slow down / pacing
        async for chunk in _stream_groq(system_prompt, user_prompt, model=MODEL_FAST_STREAM):
            buffer += chunk
            token_count += 1
            print(chunk, end="", flush=True)  # still stream to console
            if not hallucination_triggered:
                await policeman.check_drift(
                    objective=topic,
                    generation_buffer=buffer,
                    on_hallucination=on_hallucination,
                    token_count=token_count,
                )
    except Exception as e:
        err = f"\n🛑 **Stream Error**: {type(e).__name__} — {e}\n"
        logger.error(f"[_run_agent_turn] {err}", exc_info=True)
        print(err)
        buffer += err

    if hallucination_triggered:
        buffer += "\n\n*[Context corrected via MCP. Continuing with grounded data.]*"

    print(f"\n[{persona_name} FINISHED — MOCK] {token_count} tokens")
    # ── Broadcast ONE complete agent_response (frontend fake-streams this) ──
    await _broadcast({"type": "agent_response", "speaker": persona_key, "content": buffer})

    new_msg = {"speaker": persona_key, "content": buffer, "hallucinated": hallucination_triggered}
    return {
        **state,
        "messages": [new_msg],
        "current_speaker": persona_key,
        "hallucination_detected": state.get("hallucination_detected", False) or hallucination_triggered,
        "mcp_tool_called": "fetch_et_news_mock" if hallucination_triggered else state.get("mcp_tool_called", ""),
    }


# ═══════════════════════════════════════════════════════════════════════════
# LIVE PATH — Manual 2-call function-calling loop (openai/gpt-oss-120b)
# ═══════════════════════════════════════════════════════════════════════════

async def _run_agent_turn_live(
    state: DebateState,
    persona_key: str,
    persona_name: str,
    system_prompt: str,
    tool_schemas: list[dict],
) -> DebateState:
    """
    Live-path agent turn using openai/gpt-oss-120b with manual function-calling.

    Call 1 (non-streaming): Agent decides which tools to call.
    Tool execution: Dispatch locally, broadcast mcp_tool to UI.
    Call 2 (streaming): Agent generates final answer with tool results.
    """
    global LLM_REQUEST_COUNT
    logger.info(f"[LIVE] 🎙 STARTING TURN: {persona_name}")
    print(f"\n[LANGGRAPH LIVE] Node: {persona_name} → model: {MODEL_LIVE_REASONING}")

    topic    = state["topic"]
    history  = "\n".join(f"[{m['speaker']}]: {m['content']}" for m in state["messages"][-6:])
    graph_ctx = json.dumps(state.get("graph_context", {}), indent=2)[:600]

    user_content = (
        f"Market Event: {topic}\n\n"
        f"Recent Debate:\n{history}\n\n"
        f"Supply-Chain Context:\n{graph_ctx}\n\n"
        f"Use available tools to ground your analysis, then give your perspective as {persona_name}."
    )

    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "user",   "content": user_content},
    ]

    client = get_groq_client()  # initial client; replaced on 429 retries below
    await _broadcast({"type": "speaker_change", "speaker": persona_key})
    await asyncio.sleep(0.01)
    await _broadcast({"type": "token", "speaker": persona_key, "content": " *[Researching with live tools...]* "})

    # ── Call 1: Tool Decision ────────────────────────────────────────────────
    tool_calls_made = []
    try:
        await asyncio.sleep(4) # Rate-limit delay
        LLM_REQUEST_COUNT += 1
        print(f"[{LLM_REQUEST_COUNT}] 🚀 [Groq Request] model={MODEL_LIVE_REASONING} (Call 1: Tools)")
        print(f"[{persona_name}] Call 1 → tool decision ({MODEL_LIVE_REASONING})")
        resp1 = await client.chat.completions.create(
            model=MODEL_LIVE_REASONING,
            messages=messages,
            tools=tool_schemas,
            tool_choice="auto",
            max_tokens=1024,
            reasoning_effort="medium",
        )
        assistant_msg = resp1.choices[0].message

        # Append the assistant's (possibly tool-calling) message
        assistant_dict = {"role": "assistant", "content": assistant_msg.content or ""}
        if assistant_msg.tool_calls:
            assistant_dict["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in assistant_msg.tool_calls
            ]
        messages.append(assistant_dict)

        # ── Tool Execution ───────────────────────────────────────────────────
        if assistant_msg.tool_calls:
            for tc in assistant_msg.tool_calls:
                fn_name = tc.function.name
                try:
                    fn_args = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    fn_args = {}

                print(f"[{persona_name}] 🔌 Dispatching tool: {fn_name}({fn_args})")
                logger.info(f"[{persona_name}] Tool dispatch: {fn_name}")

                try:
                    result = await _dispatch_tool(fn_name, fn_args)
                except Exception as exc:
                    result = {"error": str(exc)}
                    logger.error(f"[{persona_name}] Tool {fn_name} failed: {exc}")

                await _broadcast({"type": "mcp_tool", "tool": fn_name, "data": result})
                tool_calls_made.append(fn_name)

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result)[:2000],  # cap to avoid context overflow
                })
                print(f"[{persona_name}] ✅ {fn_name} complete.")

    except Exception as exc:
        err_str = str(exc)
        logger.error(f"[_run_agent_turn_live] Call 1 failed: {exc}", exc_info=True)
        print(f"\n[{persona_name}] ⚠️ Call 1 error: {exc}")
        # Fall through to Call 2 with original messages (no tools)

    # ── Call 2: Collect Full Final Answer (buffered, NOT per-token broadcast) ──
    buffer = ""
    token_count = 0
    hallucination_triggered = False
    policeman = ThoughtPoliceman()

    async def on_hallucination():
        nonlocal hallucination_triggered
        hallucination_triggered = True
        await _broadcast({"type": "hallucination_detected", "speaker": persona_key})

    # Inject forceful no-tool instruction as system override
    messages.append({
        "role": "user",
        "content": (
            "Based on your research above, give your final trading perspective as "
            f"{persona_name}. Output ONLY plain text prose — absolutely no function "
            "calls or tool use of any kind."
        )
    })

    # ── Call 2: Single streaming block with retry (reasoning_effort + per-token broadcast) ──
    for attempt in range(3):
        call2_client = get_groq_client()  # fresh key per attempt — rotates on 429
        call2_key = call2_client.api_key
        try:
            await asyncio.sleep(2)  # pacing delay
            LLM_REQUEST_COUNT += 1
            print(f"[{LLM_REQUEST_COUNT}] 🚀 [Groq Request] model={MODEL_LIVE_REASONING} (Call 2: Stream, attempt {attempt+1})")
            print(f"[{persona_name}] Call 2 → streaming final answer ({MODEL_LIVE_REASONING})")
            stream = await call2_client.chat.completions.create(
                model=MODEL_LIVE_REASONING,
                messages=messages,
                # NO tools on Call 2 — forces the model to generate prose, not tool calls
                max_tokens=600,
                stream=True,
                reasoning_effort="medium",
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta.content or ""
                if delta:
                    buffer += delta
                    token_count += 1
                    print(delta, end="", flush=True)
                    await _broadcast({"type": "token", "speaker": persona_key, "content": delta})
                    if not hallucination_triggered and token_count >= 200:
                        await policeman.check_drift(
                            objective=topic,
                            generation_buffer=buffer,
                            on_hallucination=on_hallucination,
                            token_count=token_count,
                        )
            report_groq_success(call2_key)
            break  # success — exit retry loop
        except Exception as exc:
            if "429" in str(exc) and attempt < 2:
                # 429 = rate-limit, not a key failure — rotate and retry
                wait = (attempt + 1) * 10
                print(f"\n[{persona_name}] ⚡ 429 rate-limit, waiting {wait}s...")
                await asyncio.sleep(wait)
            else:
                report_groq_error(call2_key)
                err = f"\n🛑 **Live Stream Error**: {type(exc).__name__} — {exc}\n"
                logger.error(f"[_run_agent_turn_live] Call 2 failed: {exc}", exc_info=True)
                print(err)
                buffer += err
                await _broadcast({"type": "token", "speaker": persona_key, "content": err})
                break

    print(f"\n[{persona_name} FINISHED — LIVE] {token_count} tokens, tools: {tool_calls_made}")
    # ── Broadcast ONE complete agent_response (frontend fake-streams it) ──
    await _broadcast({"type": "agent_response", "speaker": persona_key, "content": buffer})

    new_msg = {
        "speaker": persona_key,
        "content": buffer,
        "hallucinated": hallucination_triggered,
        "tools_used": tool_calls_made,
    }
    return {
        **state,
        "messages": [new_msg],
        "current_speaker": persona_key,
        "hallucination_detected": state.get("hallucination_detected", False) or hallucination_triggered,
        "mcp_tool_called": ", ".join(tool_calls_made) if tool_calls_made else state.get("mcp_tool_called", ""),
    }


# ═══════════════════════════════════════════════════════════════════════════
# Node functions — route to mock or live path
# ═══════════════════════════════════════════════════════════════════════════

async def retail_node(state: DebateState) -> DebateState:
    if _is_mock_event(state["topic"]):
        return await _run_agent_turn(state, "retail", "Retail Trader", RETAIL_SYSTEM, use_graph_tool=False)
    return await _run_agent_turn_live(state, "retail", "Retail Trader", RETAIL_SYSTEM, RETAIL_TOOL_SCHEMAS)


async def whale_node(state: DebateState) -> DebateState:
    if _is_mock_event(state["topic"]):
        return await _run_agent_turn(state, "whale", "Whale", WHALE_SYSTEM, use_graph_tool=True)
    return await _run_agent_turn_live(state, "whale", "Whale", WHALE_SYSTEM, WHALE_CONTRARIAN_TOOL_SCHEMAS)


async def contrarian_node(state: DebateState) -> DebateState:
    if _is_mock_event(state["topic"]):
        res = await _run_agent_turn(state, "contrarian", "Contrarian", CONTRARIAN_SYSTEM, use_graph_tool=True)
    else:
        res = await _run_agent_turn_live(state, "contrarian", "Contrarian", CONTRARIAN_SYSTEM, WHALE_CONTRARIAN_TOOL_SCHEMAS)
    res["turn_count"] = state.get("turn_count", 0) + 1
    return res


# ═══════════════════════════════════════════════════════════════════════════
# Synthesis Node — orchestrates final signal, yfinance, Neo4j write
# ═══════════════════════════════════════════════════════════════════════════

async def synthesis_node(state: DebateState) -> DebateState:
    logger.info("========== 🧠 SYNTHESIS AGENT STARTING ==========")
    print("\n[LANGGRAPH] Synthesis Agent — model: " + MODEL_LIVE_REASONING)
    await _broadcast({"type": "speaker_change", "speaker": "synthesis"})

    transcript = "\n".join(f"[{m['speaker']}]: {m['content']}" for m in state["messages"])
    graph_ctx  = json.dumps(state.get("graph_context", {}), indent=2)[:1200]

    user_prompt = (
        f"Event: {state['topic']}\n\nFull Debate Transcript:\n{transcript}\n\n"
        f"GraphRAG Context:\n{graph_ctx}\n\nGenerate the final trading signal JSON."
    )

    # Use openai/gpt-oss-120b with reasoning for synthesis
    try:
        raw = await _collect_groq(
            SYNTHESIS_SYSTEM, user_prompt,
            model=MODEL_LIVE_REASONING,
            max_tokens=1024,
            reasoning_effort="medium",
        )
    except Exception as exc:
        logger.error(f"[synthesis_node] LLM failed: {exc}")
        raw = json.dumps({
            "CONSENSUS": "NEUTRAL", "CONFIDENCE_PCT": 50,
            "PRIMARY_TICKER": "NIFTY50", "SECONDARY_TICKERS": [],
            "TIME_HORIZON": "swing", "CAUSAL_GRAPH": [], "RATIONALE": str(exc),
        })

    # Broadcast complete synthesis text as one message (frontend fake-streams it)
    await _broadcast({"type": "agent_response", "speaker": "synthesis", "content": raw})

    # ── Parse signal JSON ────────────────────────────────────────────────────
    signal: dict = {}
    causal_chain = list(state.get("causal_chain", []))
    stock_charts = dict(state.get("stock_charts", {}))

    try:
        import re
        clean = raw.replace("```json", "").replace("```", "").strip()
        clean = re.sub(r'<think>.*?</think>', '', clean, flags=re.DOTALL).strip()
        start = clean.find('{')
        end = clean.rfind('}')
        if start != -1 and end != -1:
            clean = clean[start:end+1]
        signal = json.loads(clean)
    except Exception as exc:
        logger.warning(f"[synthesis_node] JSON parse failed: {exc}")
        signal = {"raw": raw}

    # ── Autonomously fetch yfinance data for top tickers ─────────────────────
    tickers_to_chart: list[str] = []
    if "PRIMARY_TICKER" in signal:
        tickers_to_chart.append(signal["PRIMARY_TICKER"])
    for t in signal.get("SECONDARY_TICKERS", [])[:2]:  # max 2 secondary
        if t and t not in tickers_to_chart:
            tickers_to_chart.append(t)

    for ticker in tickers_to_chart:
        try:
            print(f"\n[Synthesis] 📈 Fetching stock chart for {ticker}")
            await _broadcast({"type": "mcp_tool", "tool": "get_nse_price", "data": {"ticker": ticker, "status": "fetching..."}})
            price_data = await get_nse_price(ticker)
            stock_charts[ticker] = price_data.get("ohlcv", [])
            await _broadcast({
                "type": "stock_chart",
                "ticker": ticker,
                "data": price_data.get("ohlcv", []),
                "current_price": price_data.get("current_price"),
                "change_pct": price_data.get("change_pct"),
                "mode": price_data.get("mode", "unknown"),
            })
            print(f"[Synthesis] ✅ Stock chart broadcast for {ticker}")
        except Exception as exc:
            logger.error(f"[synthesis_node] yfinance for {ticker} failed: {exc}")

    # ── Write hierarchical causal graph to Neo4j ────────────────────────────
    # Normalise to a list of link dicts regardless of whether the LLM returned
    # the new CAUSAL_GRAPH list or the legacy CAUSAL_CHAIN "A ➜ B ➜ C" string.
    raw_links: list[dict] = []
    if isinstance(signal.get("CAUSAL_GRAPH"), list):
        raw_links = signal["CAUSAL_GRAPH"]
    else:
        print("[Synthesis FALLBACK] CAUSAL_GRAPH missing or not a list — attempting old CAUSAL_CHAIN string parse")
        if "CAUSAL_CHAIN" in signal:
            link_str = str(signal["CAUSAL_CHAIN"])
            parts = [p.strip() for p in link_str.split("➜")]
            if len(parts) == 3:
                raw_links = [{"source": parts[0], "relationship": parts[1], "target": parts[2], "tier": 1, "confidence": 0.75}]

    written_count = 0
    failed_count = 0
    for link in raw_links:
        src = link.get("source", "")
        rel = link.get("relationship", "")
        tgt = link.get("target", "")
        link_tier = int(link.get("tier", 1))
        link_conf = float(link.get("confidence", 0.75))

        if not (isinstance(src, str) and src.strip() and isinstance(tgt, str) and tgt.strip()):
            print(f"[Synthesis FALLBACK] Skipping link with empty source/target: {link}")
            failed_count += 1
            continue

        try:
            await _broadcast({
                "type": "mcp_tool",
                "tool": "append_causal_link",
                "data": {"source": src, "rel": rel, "target": tgt, "tier": link_tier, "confidence": link_conf},
            })
            result = await append_causal_link(
                source=src, relationship=rel, target=tgt,
                tier=link_tier, confidence=link_conf,
            )
            if result.get("success", False):
                causal_chain.append({"source": src, "relationship": rel, "target": tgt, "tier": link_tier, "confidence": link_conf})
                await _broadcast({
                    "type": "graph_update",
                    "data": result,
                    "tier": link_tier,
                    "confidence": link_conf,
                })
                print(f"[Synthesis] ✅ Neo4j wrote tier-{link_tier}: {src} ➜ {rel} ➜ {tgt}")
                written_count += 1
            else:
                print(f"[Synthesis] ❌ Neo4j failed: {src}→{tgt}: {result.get('error')}")
                failed_count += 1
        except Exception as exc:
            logger.error(f"[synthesis_node] append_causal_link failed: {exc}")
            failed_count += 1

    print(f"[Synthesis] Graph write complete — written: {written_count} failed: {failed_count}")

    await _broadcast({
        "type": "synthesis_complete", 
        "signal": signal, 
        "causal_chain": causal_chain,
        "topic": state.get("topic", "Market Event"),
        "messages": state.get("messages", [])
    })

    return {
        **state,
        "messages": [{"speaker": "synthesis", "content": raw}],
        "current_speaker": "synthesis",
        "final_signal": signal,
        "causal_chain": causal_chain,
        "stock_charts": stock_charts,
    }


# ─── Routing ─────────────────────────────────────────────────────────────────

def route_after_contrarian(state: DebateState) -> str:
    turn = state.get("turn_count", 0)
    return "synthesis" if turn >= MAX_TURNS else "retail"


# ─── Build LangGraph ─────────────────────────────────────────────────────────

def build_trading_floor_graph():
    graph = StateGraph(DebateState)
    graph.add_node("retail",     retail_node)
    graph.add_node("whale",      whale_node)
    graph.add_node("contrarian", contrarian_node)
    graph.add_node("synthesis",  synthesis_node)

    graph.set_entry_point("retail")
    graph.add_edge("retail", "whale")
    graph.add_edge("whale",  "contrarian")
    graph.add_conditional_edges(
        "contrarian",
        route_after_contrarian,
        {"retail": "retail", "synthesis": "synthesis"},
    )
    graph.add_edge("synthesis", END)
    return graph.compile()


trading_floor_graph = build_trading_floor_graph()


# ─── Public runner ────────────────────────────────────────────────────────────

async def run_trading_floor(topic: str, graph_context: dict) -> DebateState:
    """Runs the full LangGraph debate for a given vernacular event."""
    mode = "MOCK" if _is_mock_event(topic) else "LIVE"
    print(f"\n{'='*60}")
    print(f"[FILLADO] Starting debate in {mode} mode for: '{topic}'")
    print(f"[FILLADO] Main model: {MODEL_LIVE_REASONING if mode == 'LIVE' else MODEL_FAST_STREAM}")
    print(f"{'='*60}")

    initial_state: DebateState = {
        "messages":              [],
        "topic":                 topic,
        "current_speaker":       "retail",
        "turn_count":            0,
        "graph_context":         graph_context,
        "hallucination_detected": False,
        "mcp_tool_called":       "",
        "final_signal":          {},
        "causal_chain":          [],
        "stock_charts":          {},
    }

    await _broadcast({"type": "debate_start", "topic": topic, "mode": mode})
    final_state = await trading_floor_graph.ainvoke(initial_state)
    await _broadcast({"type": "debate_end", "mode": mode})
    return final_state
