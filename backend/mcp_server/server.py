"""
backend/mcp_server/server.py
MCP Server – FastAPI APIRouter exposing all tools as POST endpoints.
Mounted at /mcp/tools by the main FastAPI app.
Agents call these endpoints internally when forced by the Thought Policeman.
"""
from fastapi import APIRouter
from pydantic import BaseModel

from backend.mcp_server.tools.read_tools import (
    fetch_et_news_mock,
    get_nse_price_mock,
    run_pattern_backtest_mock,
    execute_graphrag_query,
)
from backend.mcp_server.tools.write_tools import append_causal_link

router = APIRouter(prefix="/mcp/tools", tags=["MCP Tools"])


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class FetchNewsRequest(BaseModel):
    query: str
    timeframe: str = "7d"


class NSEPriceRequest(BaseModel):
    ticker: str


class BacktestRequest(BaseModel):
    pattern: str
    ticker: str


class GraphRAGRequest(BaseModel):
    unstructured_query: str


class CausalLinkRequest(BaseModel):
    source: str
    relationship: str
    target: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/fetch_et_news_mock", summary="Fetch grounding news from ET archive (mock)")
async def api_fetch_et_news(req: FetchNewsRequest):
    return fetch_et_news_mock(query=req.query, timeframe=req.timeframe)


@router.post("/get_nse_price_mock", summary="Fetch OHLCV data for an NSE ticker (mock)")
async def api_get_nse_price(req: NSEPriceRequest):
    return get_nse_price_mock(ticker=req.ticker)


@router.post("/run_pattern_backtest_mock", summary="Historical backtest for a chart pattern (mock)")
async def api_run_backtest(req: BacktestRequest):
    return run_pattern_backtest_mock(pattern=req.pattern, ticker=req.ticker)


@router.post("/execute_graphrag_query", summary="Extract entities and query Neo4j supply-chain graph")
async def api_execute_graphrag(req: GraphRAGRequest):
    return await execute_graphrag_query(unstructured_query=req.unstructured_query)


@router.post("/append_causal_link", summary="Write new causal market connection to Neo4j AuraDB")
async def api_append_causal_link(req: CausalLinkRequest):
    return await append_causal_link(
        source=req.source,
        relationship=req.relationship,
        target=req.target,
    )


# ---------------------------------------------------------------------------
# Tool discovery endpoint (MCP-style manifest)
# ---------------------------------------------------------------------------

@router.get("/manifest", summary="List all available MCP tools")
async def get_manifest():
    return {
        "mcp_version": "1.0",
        "server_name": "fillado-mcp",
        "tools": [
            {
                "name": "fetch_et_news_mock",
                "type": "read",
                "description": "Returns verified ET news articles to ground agent debate.",
                "endpoint": "/mcp/tools/fetch_et_news_mock",
            },
            {
                "name": "get_nse_price_mock",
                "type": "read",
                "description": "Returns OHLCV data for an NSE-listed ticker.",
                "endpoint": "/mcp/tools/get_nse_price_mock",
            },
            {
                "name": "run_pattern_backtest_mock",
                "type": "read",
                "description": "Returns historical win-rate for a chart pattern on a ticker.",
                "endpoint": "/mcp/tools/run_pattern_backtest_mock",
            },
            {
                "name": "execute_graphrag_query",
                "type": "read",
                "description": "Extracts entities and queries Neo4j for supply-chain context.",
                "endpoint": "/mcp/tools/execute_graphrag_query",
            },
            {
                "name": "append_causal_link",
                "type": "write",
                "description": "Synthesis Agent writes a new market causal connection to Neo4j.",
                "endpoint": "/mcp/tools/append_causal_link",
            },
        ],
    }
