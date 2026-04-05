"""
backend/mcp_server/mcp_http_server.py

Exposes existing Fillado tools as a proper MCP-protocol HTTP endpoint
that ArmorIQ (and any other MCP client) can call.

Routes (all under the /mcp prefix):
  POST /mcp           — action dispatch
  GET  /mcp/health    — liveness + tool list
  GET  /mcp/manifest  — full MCP manifest (what ArmorIQ reads)
"""
import asyncio
import inspect
import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.mcp_server.tools.read_tools import (
    get_nse_price,
    fetch_et_news,
    execute_graphrag_query,
    run_pattern_backtest,
    get_nse_price_mock,
    fetch_et_news_mock,
)
from backend.mcp_server.tools.write_tools import append_causal_link

logger = logging.getLogger(__name__)

# ─── Action dispatch table ────────────────────────────────────────────────────

ACTION_MAP = {
    "get_nse_price":          get_nse_price,
    "fetch_et_news":          fetch_et_news,
    "execute_graphrag_query": execute_graphrag_query,
    "append_causal_link":     append_causal_link,
    "run_pattern_backtest":   run_pattern_backtest,
    "get_nse_price_mock":     get_nse_price_mock,
    "fetch_et_news_mock":     fetch_et_news_mock,
}

# ─── MCP Manifest ─────────────────────────────────────────────────────────────

MCP_MANIFEST = {
    "name": "fillado-mcp",
    "version": "1.0.0",
    "description": (
        "Supply-chain knowledge graph and NSE market data tools "
        "for Indian equity trading"
    ),
    "tools": [
        {
            "name": "get_nse_price",
            "description": "Fetch live NSE/BSE OHLCV stock data from Yahoo Finance",
            "parameters": {
                "ticker": {
                    "type": "string",
                    "required": True,
                    "description": "NSE ticker symbol e.g. ADANIPORTS",
                }
            },
        },
        {
            "name": "fetch_et_news",
            "description": "Fetch Economic Times news for a market topic via NewsData.io",
            "parameters": {
                "query":     {"type": "string", "required": True},
                "timeframe": {"type": "string", "required": False, "default": "7d"},
            },
        },
        {
            "name": "execute_graphrag_query",
            "description": "Query Neo4j supply-chain knowledge graph for causal context",
            "parameters": {
                "unstructured_query": {"type": "string", "required": True}
            },
        },
        {
            "name": "append_causal_link",
            "description": "Write a new causal relationship into the Neo4j knowledge graph",
            "parameters": {
                "source":       {"type": "string",  "required": True},
                "relationship": {"type": "string",  "required": True},
                "target":       {"type": "string",  "required": True},
                "tier":         {"type": "integer", "required": False, "default": 1},
                "confidence":   {"type": "float",   "required": False, "default": 0.75},
            },
        },
        {
            "name": "run_pattern_backtest",
            "description": "Run historical chart pattern backtest for an NSE ticker",
            "parameters": {
                "pattern": {"type": "string", "required": True},
                "ticker":  {"type": "string", "required": True},
            },
        },
    ],
}

# ─── Router ───────────────────────────────────────────────────────────────────

mcp_http_router = APIRouter(prefix="/mcp", tags=["MCP HTTP"])


class MCPActionRequest(BaseModel):
    action: str
    parameters: dict = {}


@mcp_http_router.get("/health")
async def mcp_health():
    """Liveness probe — also returns the registered tool names."""
    return {"status": "ok", "tools": list(ACTION_MAP.keys())}


@mcp_http_router.get("/manifest")
async def mcp_manifest():
    """Full MCP manifest — ArmorIQ reads this when you register the server."""
    return JSONResponse(content=MCP_MANIFEST)


@mcp_http_router.post("")
@mcp_http_router.post("/")
async def mcp_dispatch(req: MCPActionRequest):
    """
    Dispatch an MCP action call.
    Body:  { "action": "get_nse_price", "parameters": {"ticker": "ADANIPORTS"} }
    """
    fn = ACTION_MAP.get(req.action)
    if fn is None:
        logger.warning(f"[MCP HTTP] Unknown action: {req.action}")
        raise HTTPException(
            status_code=400,
            detail={"success": False, "error": f"Unknown action: {req.action}"},
        )

    try:
        logger.info(f"[MCP HTTP] Dispatching: {req.action}({req.parameters})")
        result = fn(**req.parameters)
        if inspect.iscoroutine(result):
            result = await result
        return {"success": True, "result": result}
    except Exception as exc:
        logger.error(f"[MCP HTTP] Action {req.action} failed: {exc}")
        raise HTTPException(
            status_code=500,
            detail={"success": False, "error": str(exc)},
        )
