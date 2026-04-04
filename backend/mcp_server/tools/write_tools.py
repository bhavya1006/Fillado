"""
backend/mcp_server/tools/write_tools.py
MCP Write Tool – append_causal_link

Runs Neo4j I/O in a thread executor to avoid blocking the async event loop.
"""
import asyncio
import logging
import re

from backend.core.config import get_settings

logger = logging.getLogger(__name__)

ALLOWED_RELATIONSHIPS = {
    "CAUSES", "IMPACTS", "DISRUPTS", "DELAYS", "RIPPLES",
    "SUPPLY_CHAIN_RISK", "POSITIVELY_IMPACTS", "NEGATIVELY_IMPACTS",
    "CORRELATED_WITH", "COMPETES_WITH",
}


def _validate_identifier(val: str, field: str) -> str:
    if not re.match(r'^[\w\s\-\.&]+$', val):
        raise ValueError(f"Invalid characters in {field}: {val!r}")
    return val.strip()


async def append_causal_link(source: str, relationship: str, target: str) -> dict:
    """
    Writes a new causal market connection to Neo4j AuraDB.
    Neo4j I/O runs in a thread executor so it doesn't block the WebSocket event loop.
    """
    # ── Input validation ─────────────────────────────────────────────────────
    try:
        source = _validate_identifier(source, "source")
        target = _validate_identifier(target, "target")
    except ValueError as e:
        return {"tool": "append_causal_link", "success": False, "error": str(e)}

    rel_upper = relationship.upper().replace(" ", "_")
    if rel_upper not in ALLOWED_RELATIONSHIPS:
        return {
            "tool": "append_causal_link",
            "success": False,
            "error": f"Relationship '{rel_upper}' not in allowlist: {sorted(ALLOWED_RELATIONSHIPS)}",
        }

    settings = get_settings()

    # ── Mock mode (no URI configured) ─────────────────────────────────────────
    if not settings.neo4j_uri or "your-instance-id" in settings.neo4j_uri:
        logger.info(f"[MCP-MOCK] Write: ({source})-[:{rel_upper}]->({target})")
        # Save to mock graph globally so the Graph Intelligence screen shows it
        from backend.graph.graphrag import MOCK_GRAPH
        MOCK_GRAPH["causal_chain"].append({
            "source": source,
            "relationship": rel_upper,
            "target": target
        })
        if source not in MOCK_GRAPH["entities"]: MOCK_GRAPH["entities"].append(source)
        if target not in MOCK_GRAPH["affected_tickers"]: MOCK_GRAPH["affected_tickers"].append(target)
        
        return {
            "tool": "append_causal_link",
            "success": True,
            "mode": "mock",
            "message": f"Graph learning recorded (mock): ({source})-[:{rel_upper}]->({target})",
            "source": source, "relationship": rel_upper, "target": target,
        }

    # ── Live Neo4j write (in thread executor) ─────────────────────────────────
    def _sync_write():
        from neo4j import GraphDatabase, exceptions as neo4j_exc
        driver = GraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_username, settings.neo4j_password),
            max_connection_lifetime=300,
            connection_timeout=15,
        )
        cypher = """
        MERGE (s:Entity {name: $source})
        MERGE (t:Entity {name: $target})
        MERGE (s)-[r:CAUSAL_LINK {type: $rel}]->(t)
        ON CREATE SET r.created_at = datetime(), r.source = 'fillado_synthesis'
        ON MATCH  SET r.updated_at = datetime(),
                      r.confirmed_count = coalesce(r.confirmed_count, 0) + 1
        RETURN s.name AS src, type(r) AS relationship, t.name AS tgt
        """
        try:
            with driver.session(database="neo4j") as session:
                record = session.run(cypher, source=source, target=target, rel=rel_upper).single()
            driver.close()
            return {
                "tool": "append_causal_link",
                "success": True,
                "mode": "live",
                "message": f"Neo4j updated: ({source})-[:{rel_upper}]->({target})",
                "source": source, "relationship": rel_upper, "target": target,
            }
        except Exception as exc:
            try:
                driver.close()
            except Exception:
                pass
            raise exc

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, _sync_write)
        return result
    except Exception as exc:
        logger.error(f"[append_causal_link] Neo4j write failed: {exc}")
        return {
            "tool": "append_causal_link",
            "success": False,
            "error": str(exc),
        }
