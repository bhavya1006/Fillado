"""
backend/main.py
FastAPI application entrypoint.

Routes:
  POST /api/trigger-event          → kick off the LangGraph debate
  POST /api/trigger-event-armoriq  → ArmorIQ plan+delegate + LangGraph concurrently
  GET  /api/graphrag               → standalone GraphRAG query
  GET  /api/mcp/manifest           → list MCP tools
  WS   /ws/trading-floor           → real-time streaming of debate tokens
  POST /mcp                        → MCP tool dispatch (ArmorIQ calls this)
  GET  /mcp/health                 → MCP liveness probe
  GET  /mcp/manifest               → MCP tool schemas
  /mcp/tools/*                     → MCP tool endpoints (sub-router)
  /docs                            → Swagger UI
"""
import asyncio
import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.core.config import get_settings
from backend.graph.graphrag import GraphRAGTransformer
from backend.agents.trading_floor import run_trading_floor, register_queue, unregister_queue, _broadcast
from backend.mcp_server.server import router as mcp_router
from backend.mcp_server.mcp_http_server import mcp_http_router
from backend.core.armoriq_client import trigger_via_armoriq

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
settings = get_settings()


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Fillado backend starting up…")
    print("[MCP HTTP] Endpoint live at /mcp")
    yield
    logger.info("🛑 Fillado backend shutting down…")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Fillado – Reality-Anchored Market Intelligence",
    description="AI-native market intelligence for the Indian investor. ET GenAI Hackathon.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(mcp_router)
app.include_router(mcp_http_router)  # ArmorIQ-facing MCP HTTP endpoint

# Serve generated voice MP3s as static files
_audio_dir = Path("backend/voice/audio")
_audio_dir.mkdir(parents=True, exist_ok=True)
app.mount("/audio", StaticFiles(directory=str(_audio_dir)), name="audio")


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class TriggerEventRequest(BaseModel):
    event: str = "Transport Strike in Gujarat – Truck operators call indefinite bandh"
    simulate_hallucination: bool = True  # intentionally triggers Thought Policeman once


class TriggerEventResponse(BaseModel):
    status: str
    event: str
    graph_context: dict
    message: str


class GenerateVoiceRequest(BaseModel):
    debate_id: str
    event: str
    rationale: str


# ---------------------------------------------------------------------------
# REST Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok", "service": "fillado-backend"}


@app.post("/api/generate-voice", tags=["Voice"])
async def generate_voice_endpoint(req: GenerateVoiceRequest):
    """
    Generate an AI Anchor voice clip for a debate.
    Step 1: Gemini rephrases the rationale as a news-anchor script.
    Step 2: ElevenLabs converts it to MP3 saved in backend/voice/audio/.
    Returns the URL to stream the audio plus the anchor script text.
    """
    from backend.voice.narrator import generate_debate_audio

    cfg = get_settings()

    if not cfg.elevenlabs_api_key:
        return {"audio_url": None, "script": None, "error": "ELEVENLABS_API_KEY not configured"}

    audio_path, script = await generate_debate_audio(
        debate_id=req.debate_id,
        event=req.event,
        rationale=req.rationale,
        gemini_api_key=cfg.gemini_api_key,
        elevenlabs_api_key=cfg.elevenlabs_api_key,
        voice_id=cfg.elevenlabs_voice_id,
    )

    if audio_path is None:
        return {"audio_url": None, "script": script, "error": "Voice generation failed — check server logs"}

    # Convert local path → publicly accessible URL
    filename = Path(audio_path).name
    audio_url = f"/audio/{filename}"

    return {"audio_url": audio_url, "script": script, "error": None}


@app.post("/api/trigger-event", response_model=TriggerEventResponse, tags=["Market Events"])
async def trigger_event(req: TriggerEventRequest):
    """
    Trigger a vernacular market event.
    1. Runs GraphRAGTransformer to get causal context.
    2. Fires the LangGraph debate asynchronously (results stream via WS).
    """
    transformer = GraphRAGTransformer()
    try:
        graph_ctx = await transformer.transform(req.event)
    finally:
        transformer.close()

    async def _safe_run_trading_floor():
        try:
            await run_trading_floor(topic=req.event, graph_context=graph_ctx)
        except Exception as exc:
            logger.error(f"Trading floor task crashed: {exc}")
            from backend.agents.trading_floor import _broadcast
            await _broadcast({"type": "error", "message": f"LangGraph Error: {str(exc)}"})

    # Run debate in the background so the REST response returns immediately
    asyncio.create_task(_safe_run_trading_floor())

    return TriggerEventResponse(
        status="debate_started",
        event=req.event,
        graph_context=graph_ctx,
        message="LangGraph debate initiated. Connect to /ws/trading-floor for live stream.",
    )


# ---------------------------------------------------------------------------
# ArmorIQ-enhanced endpoint (additive — does NOT change /api/trigger-event)
# ---------------------------------------------------------------------------

class TriggerEventArmorIQRequest(BaseModel):
    event: str = "Transport Strike in Gujarat – Truck operators call indefinite bandh"
    simulate_hallucination: bool = True


@app.post("/api/trigger-event-armoriq", tags=["Market Events"])
async def trigger_event_armoriq(req: TriggerEventArmorIQRequest):
    """
    ArmorIQ-enhanced trigger endpoint.
    Runs the ArmorIQ plan→token→delegate flow AND the LangGraph debate concurrently.
    The existing /api/trigger-event route is unchanged and fully functional without ArmorIQ.
    """
    transformer = GraphRAGTransformer()
    try:
        graph_ctx = await transformer.transform(req.event)
    finally:
        transformer.close()

    async def _safe_run_trading_floor():
        try:
            await run_trading_floor(topic=req.event, graph_context=graph_ctx)
        except Exception as exc:
            logger.error(f"[ArmorIQ route] Trading floor crashed: {exc}")
            await _broadcast({"type": "error", "message": f"LangGraph Error: {str(exc)}"})

    # Run ArmorIQ delegation and LangGraph debate concurrently
    armoriq_result, _ = await asyncio.gather(
        trigger_via_armoriq(req.event, graph_ctx),
        _safe_run_trading_floor(),
        return_exceptions=True,
    )

    # Broadcast ArmorIQ plan result to WebSocket clients
    if isinstance(armoriq_result, dict):
        await _broadcast({"type": "armoriq_plan", "result": armoriq_result})
    else:
        armoriq_result = {"success": False, "error": str(armoriq_result)}

    return {
        "status": "debate_started",
        "event": req.event,
        "graph_context": graph_ctx,
        "armoriq": armoriq_result,
        "message": "LangGraph debate + ArmorIQ delegation initiated. Connect to /ws/trading-floor.",
    }


@app.get("/api/graphrag", tags=["GraphRAG"])
async def graphrag_query(query: str = "Transport Strike in Gujarat"):
    """Standalone GraphRAGTransformer query (no debate)."""
    transformer = GraphRAGTransformer()
    try:
        result = await transformer.transform(query)
    finally:
        transformer.close()
    return result


@app.get("/api/mock-event", tags=["Market Events"])
async def get_mock_event():
    """Returns a sample vernacular event for the UI's pre-fill."""
    return {
        "events": [
            {
                "id": "ev-001",
                "title": "Transport Strike in Gujarat",
                "description": "Truck operators in Gujarat call indefinite bandh, Mundra port cargo movement halted.",
                "severity": "HIGH",
                "tickers": ["ADANIPORTS", "CONCOR", "GUJGASLTD"],
                "timestamp": "2024-08-15T09:30:00+05:30",
            },
            {
                "id": "ev-002",
                "title": "Hosur Factory Strike – Ashok Leyland",
                "description": "Workers at Ashok Leyland Hosur plant call strike over wage dispute.",
                "severity": "MEDIUM",
                "tickers": ["ASHOKLEY", "MRF", "APOLLOTYRE"],
                "timestamp": "2024-08-12T11:00:00+05:30",
            },
            {
                "id": "ev-003",
                "title": "Cyclone Warning – Andhra Pradesh Coast",
                "description": "IMD issues cyclone alert for AP coast, fishing and port activity suspended.",
                "severity": "HIGH",
                "tickers": ["KPITTECH", "HINDPETRO", "KARURVYSYA"],
                "timestamp": "2024-08-10T14:00:00+05:30",
            },
        ]
    }


@app.get("/api/graph-data", tags=["GraphRAG"])
async def get_graph_data():
    """
    Returns the global knowledge graph (nodes/links).
    Uses Neo4j if configured, otherwise falls back to the MOCK_GRAPH (which includes dynamic user additions).
    """
    settings = get_settings()
    
    # Try Neo4j first
    if settings.neo4j_uri and "your-instance-id" not in settings.neo4j_uri:
        try:
            from neo4j import GraphDatabase
            driver = GraphDatabase.driver(settings.neo4j_uri, auth=(settings.neo4j_username, settings.neo4j_password))
            cypher = "MATCH (n)-[r]->(m) RETURN n.name AS source, type(r) AS rel, m.name AS target, labels(n) AS src_labels, labels(m) AS tgt_labels LIMIT 150"
            with driver.session() as session:
                records = session.run(cypher).data()
            driver.close()
            
            if records:
                nodes = {}
                links = []
                for r in records:
                    s, t = r["source"], r["target"]
                    nodes[s] = {"id": s, "group": 1 if "Ticker" in r.get("src_labels", []) else 2}
                    nodes[t] = {"id": t, "group": 1 if "Ticker" in r.get("tgt_labels", []) else 2}
                    links.append({"source": s, "target": t, "label": r["rel"]})
                return {"nodes": list(nodes.values()), "links": links}
        except Exception as e:
            logger.error(f"Neo4j global graph fetch failed: {e}")

    # Fallback to the rich, in-memory mock graph (which persists append_causal_link updates)
    from backend.graph.graphrag import MOCK_GRAPH
    
    nodes_map = {}
    
    # Base event node
    if "event" in MOCK_GRAPH:
        ev = MOCK_GRAPH["event"]
        nodes_map[ev] = {"id": ev, "group": 3, "val": 30}
        
    for e in MOCK_GRAPH.get("entities", []):
        if e not in nodes_map: nodes_map[e] = {"id": e, "group": 2, "val": 20}
        
    for t in MOCK_GRAPH.get("affected_tickers", []):
        if t not in nodes_map: nodes_map[t] = {"id": t, "group": 1, "val": 25}

    links = []
    for c in MOCK_GRAPH.get("causal_chain", []):
        s, t = c["source"], c["target"]
        if s not in nodes_map: nodes_map[s] = {"id": s, "group": 2, "val": 15}
        if t not in nodes_map: nodes_map[t] = {"id": t, "group": 1, "val": 15}
        links.append({
            "source": s,
            "target": t,
            "label": c["relationship"]
        })
        
    return {"nodes": list(nodes_map.values()), "links": links}

# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------

@app.websocket("/ws/trading-floor")
async def trading_floor_ws(websocket: WebSocket):
    """
    Real-time streaming WebSocket for LangGraph debate output.
    Messages are JSON objects with shape:
      { type: string, ... }
    Types: debate_start | speaker_change | token | hallucination_detected |
           mcp_tool | graph_update | synthesis_complete | debate_end
    """
    await websocket.accept()
    logger.info("WebSocket client connected")

    queue: asyncio.Queue = asyncio.Queue(maxsize=1000)
    register_queue(queue)

    # Send a welcome heartbeat
    await websocket.send_json({"type": "connected", "message": "Fillado WebSocket ready."})

    async def _send_loop():
        try:
            while True:
                msg = await queue.get()
                await websocket.send_json(msg)
        except Exception:
            pass

    send_task = asyncio.create_task(_send_loop())

    try:
        while True:
            # Keeps connection alive and detects client disconnect instantly
            _ = await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as exc:
        logger.error(f"WebSocket error: {exc}")
    finally:
        send_task.cancel()
        unregister_queue(queue)
