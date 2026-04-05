"""
test_pipeline_better.py

Fillado — End-to-End Pipeline Monitor (v2)

Tests sequentially:
  1. MOCK PATH  — "Transport Strike in Gujarat" (fast deterministic baseline)
  2. LIVE PATH  — "SEBI F&O margin rules" (openai/gpt-oss-120b + tool-calling)
  3. UNIT TESTS — fetch_et_news three-tier fallback, get_nse_price live yfinance

All output is written to testing.txt in structured, readable format.

Usage:
    .venv\\Scripts\\python test_pipeline_better.py
    .venv\\Scripts\\python test_pipeline_better.py --mock-only
    .venv\\Scripts\\python test_pipeline_better.py --live-only
    .venv\\Scripts\\python test_pipeline_better.py --units-only
"""
from __future__ import annotations

import asyncio
import json
import sys
import httpx
import websockets
from datetime import datetime
from pathlib import Path

BASE_URL   = "http://localhost:8000"
WS_URL     = "ws://localhost:8000/ws/trading-floor"
LOG_FILE   = Path("testing.txt")

MOCK_EVENT = "Transport Strike in Gujarat"
LIVE_EVENT  = "SEBI F&O margin rules retail traders"

DIVIDER   = "═" * 72
SEPARATOR = "─" * 72


# ─────────────────────────────────────────────────────────────────────────────
# Logger
# ─────────────────────────────────────────────────────────────────────────────

class Log:
    def __init__(self, path: Path):
        self.path = path
        path.write_text("", encoding="utf-8")

    def raw(self, text: str, echo: bool = True):
        with open(self.path, "a", encoding="utf-8") as f:
            f.write(text)
        if echo:
            print(text, end="", flush=True)

    def line(self, text: str = ""):
        self.raw(text + "\n")

    def section(self, title: str):
        self.line(f"\n{DIVIDER}")
        self.line(f"  {title}")
        self.line(DIVIDER)

    def sub(self, title: str):
        self.line(f"\n{SEPARATOR}")
        self.line(f"  {title}")
        self.line(SEPARATOR)

    def ok(self, msg: str):   self.line(f"  ✅ {msg}")
    def warn(self, msg: str): self.line(f"  ⚠️  {msg}")
    def err(self, msg: str):  self.line(f"  ❌ {msg}")
    def info(self, msg: str): self.line(f"  ℹ  {msg}")
    def tool(self, msg: str): self.line(f"  🔌 {msg}")
    def chart(self, msg: str):self.line(f"  📈 {msg}")


def ts() -> str:
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]


# ─────────────────────────────────────────────────────────────────────────────
# Unit Tests  (no WebSocket — directly import tools)
# ─────────────────────────────────────────────────────────────────────────────

async def run_unit_tests(log: Log):
    log.section("UNIT TESTS — Tool Functions (Direct Import)")

    # ── Test: fetch_et_news triple-tier ──────────────────────────────────────
    log.sub("UNIT 1: fetch_et_news — Triple-Tier Fallback")
    try:
        from backend.mcp_server.tools.read_tools import fetch_et_news
        log.info("Calling fetch_et_news('Ashok Leyland strike')")
        result = await fetch_et_news("Ashok Leyland strike")
        tier = result.get("tier", "?")
        mode = result.get("mode", "?")
        summary = result.get("grounding_summary", "")[:200]
        articles = result.get("article_count", 0)
        log.ok(f"Result: tier={tier}, mode={mode}, articles={articles}")
        log.info(f"Summary: {summary}...")

        tier_label = {1: "Tier 1 — NewsData.io", 2: "Tier 2 — groq/compound", 3: "Tier 3 — Mock"}
        log.ok(f"Active tier: {tier_label.get(tier, 'Unknown')}")
    except Exception as exc:
        log.err(f"fetch_et_news failed: {exc}")

    # ── Test: get_nse_price yfinance ─────────────────────────────────────────
    log.sub("UNIT 2: get_nse_price — Live yfinance (.NS auto-suffix)")
    try:
        from backend.mcp_server.tools.read_tools import get_nse_price
        for ticker in ["ADANIPORTS", "RELIANCE", "NONEXISTENTTICKER123"]:
            log.info(f"Fetching {ticker}...")
            result = await get_nse_price(ticker)
            mode    = result.get("mode", "?")
            yf_sym  = result.get("yf_symbol", ticker)
            price   = result.get("current_price", "?")
            chg_pct = result.get("change_pct", "?")
            n       = len(result.get("ohlcv", []))
            msg = f"{ticker} ({yf_sym}) → ₹{price} ({chg_pct:+.2f}% if isinstance({chg_pct}, float) else chg_pct) — {n} candles [{mode}]"
            if mode == "live":
                log.ok(msg)
            else:
                log.warn(f"[fallback] {msg}")
    except Exception as exc:
        log.err(f"get_nse_price failed: {exc}")

    # ── Test: execute_graphrag_query ─────────────────────────────────────────
    log.sub("UNIT 3: execute_graphrag_query — Neo4j sub-graph")
    try:
        from backend.mcp_server.tools.read_tools import execute_graphrag_query
        result = await execute_graphrag_query("Transport Strike Gujarat")
        tickers= result.get("affected_tickers", [])
        chain  = result.get("causal_chain", [])
        log.ok(f"Tickers: {tickers}, Causal chain links: {len(chain)}")
    except Exception as exc:
        log.err(f"execute_graphrag_query failed: {exc}")

    # ── Test: append_causal_link Neo4j write ─────────────────────────────────
    log.sub("UNIT 4: append_causal_link — Neo4j write")
    try:
        from backend.mcp_server.tools.write_tools import append_causal_link
        result = await append_causal_link("TEST_EVENT", "IMPACTS", "TEST_TICKER")
        mode = result.get("mode", "?")
        log.ok(f"Neo4j write — mode={mode}: {result.get('message', result)}")
    except Exception as exc:
        log.err(f"append_causal_link failed: {exc}")


# ─────────────────────────────────────────────────────────────────────────────
# Full debate test over WebSocket
# ─────────────────────────────────────────────────────────────────────────────

async def run_debate_test(event: str, log: Log, label: str, timeout_s: int = 300):
    log.section(f"DEBATE TEST: {label}")
    log.info(f"Event   : {event}")
    log.info(f"Time    : {datetime.now().isoformat()}")
    log.info(f"WS      : {WS_URL}")
    log.info(f"Timeout : {timeout_s}s")

    # Per-run collectors
    transcripts: dict[str, list[str]] = {
        "retail": [], "whale": [], "contrarian": [], "synthesis": []
    }
    mcp_calls:    list[dict] = []
    stock_charts: list[dict] = []
    hallucs:      list[str]  = []
    final_signal: dict       = {}
    neo4j_writes: list[dict] = []
    current_speaker = ""
    debate_mode     = "UNKNOWN"
    completed       = False
    errors:         list[str] = []

    try:
        async with websockets.connect(WS_URL, open_timeout=10) as ws:
            log.ok(f"[{ts()}] WebSocket connected")

            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.post(
                    f"{BASE_URL}/api/trigger-event",
                    json={"event": event, "simulate_hallucination": True},
                )

            if resp.status_code != 200:
                log.err(f"API returned {resp.status_code}: {resp.text[:200]}")
                return

            api_data    = resp.json()
            debate_mode = api_data.get("mode", "UNKNOWN")
            log.ok(f"[{ts()}] API triggered — status: {api_data['status']}, mode: {debate_mode}")

            gc = api_data.get("graph_context", {})
            log.info(f"Graph context: tickers={gc.get('affected_tickers', [])}, "
                     f"confidence={gc.get('confidence', '?')}, strength={gc.get('signal_strength', '?')}")

            log.line()
            log.line(f"{'─'*72}")
            log.line("  LIVE STREAM (tokens, tools, events)")
            log.line(f"{'─'*72}")

            async def _listen():
                nonlocal current_speaker, final_signal, completed, debate_mode

                async for raw in ws:
                    msg   = json.loads(raw)
                    mtype = msg.get("type", "")

                    if mtype == "connected":
                        continue

                    elif mtype == "debate_start":
                        debate_mode = msg.get("mode", debate_mode)
                        badge = "⚡ LIVE" if debate_mode == "LIVE" else "◎ MOCK"
                        log.line(f"\n[{ts()}] 🚀 DEBATE STARTED — {badge}")

                    elif mtype == "speaker_change":
                        current_speaker = msg["speaker"]
                        log.line(f"\n\n▶▶▶  {current_speaker.upper()}  ◀◀◀\n")

                    elif mtype == "token":
                        chunk   = msg.get("content", "")
                        speaker = msg.get("speaker", current_speaker)
                        if speaker in transcripts:
                            transcripts[speaker].append(chunk)
                        log.raw(chunk, echo=True)

                    elif mtype == "agent_response":
                        speaker = msg.get("speaker", current_speaker)
                        content = msg.get("content", "")
                        if speaker in transcripts:
                            # Replace with latest complete turn (not append)
                            transcripts[speaker] = [content]
                        log.line(f"\n[{ts()}] 💬 AGENT RESPONSE [{speaker}]: {content[:120]}...")

                    elif mtype == "hallucination_detected":
                        spk = msg.get("speaker", "?")
                        hallucs.append(spk)
                        log.line(f"\n[{ts()}] 🚨 THOUGHT POLICEMAN intercepted [{spk}]")

                    elif mtype == "mcp_tool":
                        tool = msg.get("tool", "?")
                        data = msg.get("data", {})
                        # Extract tier info if present
                        tier = data.get("tier", "")
                        tier_tag = f" [tier={tier}]" if tier else ""
                        mcp_calls.append({
                            "tool": tool, "ts": ts(), "tier": tier,
                            "mode": data.get("mode", ""),
                            "articles": data.get("article_count", ""),
                            "ticker": data.get("ticker", ""),
                            "price": data.get("current_price", ""),
                        })
                        log.line(f"\n[{ts()}] 🔌 MCP: {tool}(){tier_tag}")
                        if "grounding_summary" in data:
                            log.line(f"           Summary: {str(data['grounding_summary'])[:120]}")
                        if "current_price" in data:
                            log.line(f"           Price: ₹{data['current_price']} ({data.get('change_pct', '?')}%)")

                    elif mtype == "stock_chart":
                        ticker  = msg.get("ticker", "?")
                        n       = len(msg.get("data", []))
                        price   = msg.get("current_price", "?")
                        chg     = msg.get("change_pct", "?")
                        cmode   = msg.get("mode", "?")
                        stock_charts.append({"ticker": ticker, "candles": n, "price": price, "chg": chg, "mode": cmode})
                        log.line(f"\n[{ts()}] 📈 STOCK CHART broadcast: {ticker} ₹{price} ({chg}%) [{cmode.upper()}] {n} candles")

                    elif mtype == "graph_update":
                        neo4j_writes.append(msg.get("data", {}))
                        log.line(f"\n[{ts()}] 🔗 NEO4J WRITE: {msg.get('data', {}).get('message', msg.get('data', {}))}")

                    elif mtype == "synthesis_complete":
                        final_signal = msg.get("signal", {})
                        log.line(f"\n\n[{ts()}] ✅ SYNTHESIS COMPLETE:")
                        for k, v in final_signal.items():
                            log.line(f"    {k}: {v}")

                    elif mtype == "debate_end":
                        completed = True
                        log.line(f"\n[{ts()}] 🏁 DEBATE ENDED")
                        return

                    elif mtype == "error":
                        err_msg = msg.get("message", str(msg))
                        errors.append(err_msg)
                        log.err(f"[{ts()}] BACKEND ERROR: {err_msg}")

            try:
                await asyncio.wait_for(_listen(), timeout=timeout_s)
            except asyncio.TimeoutError:
                log.warn(f"[{ts()}] Timed out after {timeout_s}s")

    except Exception as exc:
        log.err(f"Connection error: {type(exc).__name__}: {exc}")
        return

    # ── Summary (printed ONCE after stream fully completes) ──────────
    log.sub(f"SUMMARY — {label}")
    log.info(f"Mode       : {debate_mode}")
    log.info(f"Completed  : {'✅ Yes' if completed else '⚠️ No'}")
    log.info(f"Errors     : {len(errors)} {'— ' + '; '.join(errors[:2]) if errors else '(none)'}")
    log.info(f"Intercepts : {len(hallucs)} ({hallucs})")

    # Deduplicate MCP calls by (tool, ts) to prevent log repetition
    seen_mcp: set = set()
    deduped: list = []
    for c in mcp_calls:
        key = (c["tool"], c["ts"])
        if key not in seen_mcp:
            seen_mcp.add(key)
            deduped.append(c)

    log.info(f"MCP Calls  : {len(deduped)}")
    for c in deduped:
        tier_tag = f" [tier={c['tier']}]" if c.get("tier") else ""
        mode_tag = f" [{c['mode']}]" if c.get("mode") else ""
        art_tag  = f" articles={c['articles']}" if c.get("articles") != "" else ""
        price_tag = f" ₹{c['price']}" if c.get("price") else ""
        log.tool(f"{c['ts']} {c['tool']}(){tier_tag}{mode_tag}{art_tag}{price_tag}")

    log.info(f"Neo4j writes: {len(neo4j_writes)}")
    log.info(f"Stock Charts : {len(stock_charts)}")
    for sc in stock_charts:
        log.chart(f"{sc['ticker']}: ₹{sc['price']} ({sc['chg']}%) [{sc['mode'].upper()}] {sc['candles']} candles")

    log.line()
    log.info("Final Trading Signal:")
    for k, v in final_signal.items():
        log.line(f"    {k}: {v}")

    log.line()
    log.info("Agent Transcripts (previews):")
    for agent, chunks in transcripts.items():
        text = "".join(chunks).strip()
        if text:
            preview = text[:250].replace("\n", " ")
            log.line(f"    [{agent.upper()}] ({len(text)} chars) → {preview}...")


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

async def main():
    args = sys.argv[1:]
    run_mock  = "--live-only"   not in args and "--units-only" not in args
    run_live  = "--mock-only"   not in args and "--units-only" not in args
    run_units = "--mock-only"   not in args and "--live-only"  not in args

    log = Log(LOG_FILE)

    log.line("╔" + "═" * 70 + "╗")
    log.line("║   FILLADO — HYBRID EXECUTION ENGINE — E2E PIPELINE TEST v2      ║")
    log.line("╚" + "═" * 70 + "╝")
    log.line(f"  Started : {datetime.now().isoformat()}")
    log.line(f"  Backend : {BASE_URL}")
    log.line(f"  Log File: {LOG_FILE.resolve()}")
    log.line(f"  Modes   : mock={run_mock}, live={run_live}, units={run_units}")

    # ── Health check ──────────────────────────────────────────────────────────
    log.sub("BACKEND HEALTH CHECK")
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            h = await client.get(f"{BASE_URL}/health")
        log.ok(f"Backend reachable: {h.json()}")
    except Exception as exc:
        log.err(f"Backend not reachable at {BASE_URL}: {exc}")
        log.line("  Start: .venv\\Scripts\\python -m uvicorn backend.main:app --port 8000")
        return

    # Check which keys are configured
    try:
        import dotenv, os
        dotenv.load_dotenv()
        newsdata = "✅" if os.getenv("NEWSDATA_API_KEY") else "⚠️  missing"
        groq_key = "✅" if os.getenv("GROQ_API_KEY") else "❌ missing"
        neo4j    = "✅" if os.getenv("NEO4J_URI") else "⚠️  not set (mock mode)"
        log.info(f"GROQ_API_KEY      : {groq_key}")
        log.info(f"NEWSDATA_API_KEY  : {newsdata}  (Tier 1 news)")
        log.info(f"NEO4J_URI         : {neo4j}")
    except Exception:
        pass

    # ── Unit tests ────────────────────────────────────────────────────────────
    if run_units:
        await run_unit_tests(log)

    # ── Mock debate ───────────────────────────────────────────────────────────
    if run_mock:
        await run_debate_test(
            MOCK_EVENT, log,
            label="MOCK PATH — 'Transport Strike in Gujarat'",
            timeout_s=120,
        )
        if run_live:
            log.line(f"\n  Waiting 5s before live test...\n")
            await asyncio.sleep(5)

    # ── Live debate ───────────────────────────────────────────────────────────
    if run_live:
        await run_debate_test(
            LIVE_EVENT, log,
            label="LIVE PATH — openai/gpt-oss-120b + tool-calling + yfinance",
            timeout_s=300,
        )

    # ── Footer ────────────────────────────────────────────────────────────────
    log.line(f"\n{'═'*72}")
    log.line("  ALL TESTS COMPLETE")
    log.line(f"  Log saved: {LOG_FILE.resolve()}")
    log.line(f"{'═'*72}")


if __name__ == "__main__":
    asyncio.run(main())
