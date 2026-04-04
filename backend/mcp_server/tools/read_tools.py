"""
backend/mcp_server/tools/read_tools.py

MCP Read Tools.
Each tool has a live implementation (yfinance / groq-compound) with a
mock fallback so the demo always works even without API connectivity.

Available tools:
  - fetch_et_news_mock(query)          — deterministic mock articles
  - fetch_et_news(query)               — groq/compound live web sub-agent
  - get_nse_price_mock(ticker)         — deterministic OHLCV mock
  - get_nse_price(ticker)              — live yfinance data (.NS suffix)
  - run_pattern_backtest_mock(p, t)    — historical backtest mock
  - run_pattern_backtest(p, t)         — alias → mock (upgradeable)
  - execute_graphrag_query(query)      — delegates to GraphRAGTransformer
"""
import json
import logging
import asyncio
from datetime import datetime, timedelta
import random
import os
import httpx
from groq import Groq

from backend.core.config import get_settings

logger = logging.getLogger(__name__)


# ============================================================================
# Tool 1 — ET News (Mock)
# ============================================================================

_ET_NEWS_DB = {
    "transport strike gujarat": [
        {
            "headline": "Gujarat Transport Strike Enters Day 3, Cargo Movement Halted",
            "source": "Economic Times",
            "date": "2024-08-15",
            "url": "https://economictimes.indiatimes.com/mock-1",
            "summary": (
                "Truck operators in Gujarat have called an indefinite strike, disrupting "
                "freight movements to ports including Mundra and Pipavav."
            ),
            "tickers_mentioned": ["ADANIPORTS", "GUJGASLTD", "CONCOR"],
        },
        {
            "headline": "Logistics Sector Braces for Impact as Gujarat Strike Continues",
            "source": "ET Markets",
            "date": "2024-08-14",
            "url": "https://economictimes.indiatimes.com/mock-2",
            "summary": "Analysts warn of supply-chain ripple effects on petrochemical and FMCG sectors.",
            "tickers_mentioned": ["MAHLOG", "ADANIPORTS", "RELIANCE"],
        },
    ],
    "factory strike": [
        {
            "headline": "Hosur Factory Workers Call Strike, Ashok Leyland Output Halted",
            "source": "Economic Times",
            "date": "2024-08-12",
            "url": "https://economictimes.indiatimes.com/mock-3",
            "summary": "Production at the Ashok Leyland Hosur plant has been suspended following a wage dispute.",
            "tickers_mentioned": ["ASHOKLEY", "MRF", "APOLLOTYRE"],
        }
    ],
    "default": [
        {
            "headline": "Indian Markets Cautious Amid Regional Disruptions",
            "source": "ET Markets",
            "date": "2024-08-15",
            "url": "https://economictimes.indiatimes.com/mock-4",
            "summary": "Multiple sector-specific disruptions are creating pockets of volatility in mid-cap indices.",
            "tickers_mentioned": ["NIFTY50", "MIDCAP"],
        }
    ],
}


def fetch_et_news_mock(query: str, timeframe: str = "7d") -> dict:
    """Returns mock Economic Times articles. MCP Tool: fetch_et_news_mock"""
    q_lower = query.lower()
    articles = _ET_NEWS_DB["default"]
    for key, val in _ET_NEWS_DB.items():
        if key != "default" and any(word in q_lower for word in key.split()):
            articles = val
            break

    return {
        "tool": "fetch_et_news_mock",
        "query": query,
        "timeframe": timeframe,
        "article_count": len(articles),
        "articles": articles,
        "grounding_summary": f"Found {len(articles)} ET articles about '{query}' in the last {timeframe}.",
    }


# ============================================================================
# Tool 1b — ET News (Live — Triple-Tier Fallback Pipeline)
# ============================================================================

async def fetch_et_news(query: str, timeframe: str = "7d") -> dict:
    """
    Live ET news fetcher with triple-tier fallback.

    Tier 1: NewsData.io API — fast, targeted at economictimes.indiatimes.com
    Tier 2: groq/compound   — autonomous web-browsing sub-agent
    Tier 3: Mock data       — deterministic fallback (always succeeds)

    MCP Tool: fetch_et_news
    """
    settings = get_settings()

    # ─── TIER 1: NewsData.io API ─────────────────────────────────────────────
    try:
        if not settings.newsdata_api_key:
            raise ValueError("NEWSDATA_API_KEY not configured — skipping to Tier 2")

        logger.info(f"[fetch_et_news] TIER 1: NewsData.io for '{query}'")
        print(f"\n[MCP TIER-1] 📰 NewsData.io → ET search for: '{query}'")

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://newsdata.io/api/1/latest",
                params={
                    "apikey": settings.newsdata_api_key,
                    "q":         query,
                    "country":   "in",
                    "language":  "en",
                    "domainurl": "economictimes.indiatimes.com",
                },
            )
            response.raise_for_status()
            data = response.json()

        results = data.get("results", [])

        # RETRY: if ET-specific search returned nothing, retry with broader Indian financial news
        if not results:
            logger.info(f"[fetch_et_news] TIER 1: No ET results, retrying without domain filter")
            print(f"[MCP TIER-1] ♻ 0 ET results — retrying with broader Indian finance news")
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp2 = await client.get(
                    "https://newsdata.io/api/1/latest",
                    params={
                        "apikey":    settings.newsdata_api_key,
                        "q":         query,
                        "country":   "in",
                        "language":  "en",
                        "category":  "business",  # broad Indian business news
                    },
                )
                resp2.raise_for_status()
                results = resp2.json().get("results", [])

        if not results:
            raise ValueError(f"NewsData.io: 0 results for '{query}' (both domain+broad searches)")


        # Extract top 3 articles
        articles = []
        raw_text = ""
        for item in results[:3]:
            articles.append({
                "headline": item.get("title", ""),
                "source":   item.get("source_id", "Economic Times"),
                "date":     item.get("pubDate", ""),
                "url":      item.get("link", ""),
            })
            raw_text += f"Headline: {item.get('title', '')}\nDescription: {item.get('description', '')}\n\n"

        # Synthesise market impact with llama-3.1-8b-instant (fast, cheap)
        groq_client = Groq(api_key=settings.groq_api_key)
        summary_resp = groq_client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{
                "role": "user",
                "content": (
                    f"Based on these recent news articles about '{query}', write a 2-sentence "
                    f"summary focusing on financial and supply-chain impact. "
                    f"List any mentioned NSE/BSE companies.\n\n{raw_text}"
                ),
            }],
            temperature=0.2,
            max_tokens=200,
        )
        impact_summary = summary_resp.choices[0].message.content.strip()

        print(f"[MCP TIER-1] ✅ NewsData.io: {len(articles)} articles fetched & summarised")
        return {
            "tool":              "fetch_et_news",
            "tier":              1,
            "mode":              "live_newsdata",
            "query":             query,
            "timeframe":         timeframe,
            "grounding_summary": impact_summary,
            "articles":          articles,
            "article_count":     len(articles),
        }

    except Exception as tier1_exc:
        logger.warning(f"[fetch_et_news] TIER 1 failed: {tier1_exc} — trying Tier 2")
        print(f"[MCP TIER-1] ⚠️ Failed ({tier1_exc}) — escalating to TIER 2: groq/compound")

        # ─── TIER 2: groq/compound Web Sub-Agent ─────────────────────────────
        try:
            if not settings.groq_api_key:
                raise ValueError("GROQ_API_KEY not configured")

            logger.info(f"[fetch_et_news] TIER 2: groq/compound web sub-agent for '{query}'")
            print(f"[MCP TIER-2] 🌐 groq/compound sub-agent searching for: '{query}'")

            # Truncate query to 80 chars to prevent 413 Entity Too Large from groq/compound
            safe_query = query[:80]

            def _call_compound():
                client = Groq(
                    api_key=settings.groq_api_key,
                    default_headers={"Groq-Model-Version": "latest"},
                )
                return client.chat.completions.create(
                    messages=[{
                        "role": "user",
                        "content": (
                            f"Search Indian financial news for: {safe_query!r}. "
                            "Summarise market impact in 2 sentences. "
                            "Reply JSON: {\"market_impact_summary\": str, \"key_tickers\": [str]}."
                        ),
                    }],
                    model="groq/compound",
                    extra_body={
                        "compound_custom": {
                            "tools": {"enabled_tools": ["web_search", "visit_website"]}
                        }
                    },
                )

            resp = await asyncio.get_event_loop().run_in_executor(None, _call_compound)
            raw = resp.choices[0].message.content or ""

            try:
                clean = raw.replace("```json", "").replace("```", "").strip()
                parsed = json.loads(clean)
            except json.JSONDecodeError:
                parsed = {"market_impact_summary": raw, "articles": [], "key_tickers": []}

            print(f"[MCP TIER-2] ✅ groq/compound response received ({len(raw)} chars)")
            return {
                "tool":              "fetch_et_news",
                "tier":              2,
                "mode":              "live_compound",
                "query":             query,
                "timeframe":         timeframe,
                "grounding_summary": parsed.get("market_impact_summary", raw[:400]),
                "articles":          parsed.get("articles", []),
                "key_tickers":       parsed.get("key_tickers", []),
                "article_count":     len(parsed.get("articles", [])),
            }

        except Exception as tier2_exc:
            logger.warning(f"[fetch_et_news] TIER 2 failed: {tier2_exc} — falling back to Tier 3 mock")
            print(f"[MCP TIER-2] ⚠️ Failed ({tier2_exc}) — falling back to TIER 3: mock data")

            # ─── TIER 3: Deterministic Mock (always succeeds) ─────────────────
            logger.info(f"[fetch_et_news] TIER 3: returning mock data for '{query}'")
            print(f"[MCP TIER-3] 🔒 Serving deterministic mock for '{query}'")
            result = fetch_et_news_mock(query, timeframe)
            result["tool"] = "fetch_et_news"
            result["tier"] = 3
            result["mode"] = "mock_fallback"
            return result




# ============================================================================
# Tool 2 — NSE Price (Mock)
# ============================================================================

_BASE_PRICES = {
    "ADANIPORTS": 1280.50, "GUJGASLTD": 485.75, "CONCOR": 890.20,
    "MAHLOG": 412.35, "RELIANCE": 2945.60, "ASHOKLEY": 198.40,
    "MRF": 148500.00, "APOLLOTYRE": 476.80, "NIFTY50": 24750.00,
    "TCS": 3820.00, "INFY": 1455.00, "WIPRO": 478.00, "HDFCBANK": 1680.00,
    "ICICIBANK": 1120.00, "SBIN": 812.00, "TATAMOTORS": 966.00,
    "BAJFINANCE": 6950.00, "MARUTI": 12800.00, "SUNPHARMA": 1820.00,
}


def get_nse_price_mock(ticker: str) -> dict:
    """Returns deterministic mock OHLCV data. MCP Tool: get_nse_price_mock"""
    base = _BASE_PRICES.get(ticker.upper(), 500.00)
    today = datetime.now()
    ohlcv, price = [], base

    for i in range(30):
        day = today - timedelta(days=29 - i)
        if day.weekday() >= 5:
            continue
        change_pct = random.uniform(-0.025, 0.02)
        open_p = round(price, 2)
        close_p = round(price * (1 + change_pct), 2)
        high_p = round(max(open_p, close_p) * random.uniform(1.001, 1.012), 2)
        low_p = round(min(open_p, close_p) * random.uniform(0.988, 0.999), 2)
        volume = random.randint(500_000, 5_000_000)
        ohlcv.append({
            "date": day.strftime("%Y-%m-%d"),
            "open": open_p, "high": high_p,
            "low": low_p, "close": close_p, "volume": volume,
        })
        price = close_p

    current, prev = ohlcv[-1], ohlcv[-2]
    change = round(current["close"] - prev["close"], 2)
    change_pct_val = round((change / prev["close"]) * 100, 2)

    return {
        "tool": "get_nse_price_mock",
        "mode": "mock",
        "ticker": ticker.upper(),
        "current_price": current["close"],
        "change": change,
        "change_pct": change_pct_val,
        "52w_high": round(base * 1.28, 2),
        "52w_low": round(base * 0.71, 2),
        "ohlcv": ohlcv,
        "market_cap_cr": round(base * random.randint(50_000_000, 200_000_000) / 1e7, 0),
    }


# ============================================================================
# Tool 2b — NSE Price (Live — yfinance)
# ============================================================================

async def get_nse_price(ticker: str) -> dict:
    """
    Live OHLCV data from Yahoo Finance (NSE). Auto-appends .NS suffix.
    Falls back to get_nse_price_mock on failure.
    MCP Tool: get_nse_price
    """
    try:
        import yfinance as yf

        sym = ticker.upper()
        sym = ticker.upper()
        # Add this mapping for major indices:
        if sym == "NIFTY50":
            yf_sym = "^NSEI"
        elif sym == "SENSEX":
            yf_sym = "^BSESN"
        else:
            yf_sym = sym if sym.endswith(".NS") or sym.endswith(".BO") else f"{sym}.NS"


        logger.info(f"[get_nse_price] Fetching live data for {yf_sym}")
        print(f"\n[MCP LIVE] 📈 yfinance fetching OHLCV for {yf_sym}")

        def _fetch():
            t = yf.Ticker(yf_sym)
            hist = t.history(period="1mo", interval="1d")
            info = t.fast_info if hasattr(t, "fast_info") else {}
            return hist, info

        hist, info = await asyncio.get_event_loop().run_in_executor(None, _fetch)

        if hist.empty:
            raise ValueError(f"No data returned for {yf_sym}")

        ohlcv = []
        for date, row in hist.iterrows():
            ohlcv.append({
                "date": date.strftime("%Y-%m-%d"),
                "open": round(float(row["Open"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "close": round(float(row["Close"]), 2),
                "volume": int(row["Volume"]),
            })

        current = ohlcv[-1]
        prev = ohlcv[-2] if len(ohlcv) >= 2 else ohlcv[-1]
        change = round(current["close"] - prev["close"], 2)
        change_pct_val = round((change / prev["close"]) * 100, 2) if prev["close"] else 0

        market_cap = None
        try:
            market_cap = getattr(info, "market_cap", None)
        except Exception:
            pass

        print(f"[MCP LIVE] ✅ {yf_sym}: ₹{current['close']} ({change_pct_val:+.2f}%)")

        return {
            "tool": "get_nse_price",
            "mode": "live",
            "ticker": sym,
            "yf_symbol": yf_sym,
            "current_price": current["close"],
            "change": change,
            "change_pct": change_pct_val,
            "ohlcv": ohlcv,
            "market_cap": market_cap,
        }

    except Exception as exc:
        logger.error(f"[get_nse_price] yfinance failed for {ticker}: {exc} — using mock")
        print(f"[MCP LIVE] ⚠️ yfinance failed ({exc}), falling back to mock")
        result = get_nse_price_mock(ticker)
        result["tool"] = "get_nse_price"
        result["mode"] = "mock_fallback"
        return result


# ============================================================================
# Tool 3 — Pattern Backtest (Mock — upgradeable)
# ============================================================================

_BACKTEST_PATTERNS = {
    "bull flag": {"win_rate": 62, "avg_gain_pct": 14.3, "avg_loss_pct": -5.2, "trades": 147},
    "bear flag": {"win_rate": 58, "avg_gain_pct": 12.1, "avg_loss_pct": -6.8, "trades": 89},
    "head and shoulders": {"win_rate": 71, "avg_gain_pct": 18.7, "avg_loss_pct": -7.1, "trades": 63},
    "double bottom": {"win_rate": 67, "avg_gain_pct": 15.2, "avg_loss_pct": -4.9, "trades": 112},
    "cup and handle": {"win_rate": 74, "avg_gain_pct": 21.4, "avg_loss_pct": -6.3, "trades": 55},
    "default": {"win_rate": 55, "avg_gain_pct": 10.0, "avg_loss_pct": -6.0, "trades": 200},
}


def run_pattern_backtest_mock(pattern: str, ticker: str) -> dict:
    """Historical backtest statistics for a chart pattern. MCP Tool: run_pattern_backtest_mock"""
    pattern_lower = pattern.lower()
    stats = _BACKTEST_PATTERNS.get("default")
    for key, val in _BACKTEST_PATTERNS.items():
        if key != "default" and key in pattern_lower:
            stats = val
            break

    return {
        "tool": "run_pattern_backtest_mock",
        "pattern": pattern, "ticker": ticker.upper(),
        "win_rate_pct": stats["win_rate"],
        "avg_gain_pct": stats["avg_gain_pct"],
        "avg_loss_pct": stats["avg_loss_pct"],
        "num_historical_trades": stats["trades"],
        "summary": (
            f"{pattern} on {ticker.upper()} has a {stats['win_rate']}% historical win rate "
            f"over {stats['trades']} trades, avg gain {stats['avg_gain_pct']}%, "
            f"avg loss {stats['avg_loss_pct']}%."
        ),
    }


async def run_pattern_backtest(pattern: str, ticker: str) -> dict:
    """Async alias for run_pattern_backtest_mock (upgradeable to live). MCP Tool: run_pattern_backtest"""
    result = run_pattern_backtest_mock(pattern, ticker)
    result["tool"] = "run_pattern_backtest"
    return result


# ============================================================================
# Tool 4 — GraphRAG Query (delegates to GraphRAGTransformer)
# ============================================================================

async def execute_graphrag_query(unstructured_query: str) -> dict:
    """
    Delegates to GraphRAGTransformer to extract entities and return a
    LOCALIZED supply-chain sub-graph from Neo4j AuraDB (NOT the full DB).
    MCP Tool: execute_graphrag_query
    """
    from backend.graph.graphrag import GraphRAGTransformer
    transformer = GraphRAGTransformer()
    result = await transformer.transform(unstructured_query)
    transformer.close()
    return {
        "tool": "execute_graphrag_query",
        "query": unstructured_query,
        **result,
    }
