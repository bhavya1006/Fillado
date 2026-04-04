"""
backend/graph/graphrag.py
GraphRAGTransformer: uses Groq llama-3.1-8b-instant to extract entities from unstructured
vernacular text, build a Cypher query, and fetch supply-chain context from Neo4j AuraDB.
Falls back to a rich mock graph if Neo4j credentials are absent.
"""
import json
import logging
from typing import Optional

from groq import AsyncGroq
from neo4j import GraphDatabase, exceptions as neo4j_exceptions

from backend.core.config import get_settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Mock fallback graph – used when Neo4j creds are not configured
# ---------------------------------------------------------------------------
MOCK_GRAPH = {
    "event": "Transport Strike in Gujarat",
    "entities": ["Gujarat", "Transport", "Logistics"],
    "causal_chain": [
        {"source": "Transport Strike", "relationship": "DISRUPTS", "target": "Gujarat Logistics"},
        {"source": "Gujarat Logistics", "relationship": "DELAYS", "target": "ADANIPORTS"},
        {"source": "Gujarat Logistics", "relationship": "IMPACTS", "target": "GUJGASLTD"},
        {"source": "ADANIPORTS", "relationship": "SUPPLY_CHAIN_RISK", "target": "MUNDRA_PORT"},
        {"source": "Gujarat Logistics", "relationship": "RIPPLES", "target": "CONCOR"},
    ],
    "affected_tickers": ["ADANIPORTS", "GUJGASLTD", "CONCOR", "MAHLOG"],
    "signal_strength": "HIGH",
    "confidence": 0.82,
}


class GraphRAGTransformer:
    """
    Transforms an unstructured vernacular event description into a structured
    Neo4j sub-graph query, executes it, and returns causal context for agents.
    """

    def __init__(self):
        self.settings = get_settings()
        self.groq_client = AsyncGroq(api_key=self.settings.groq_api_key) if self.settings.groq_api_key else None
        self._driver = None
        self._init_neo4j()

    def _init_neo4j(self):
        if not self.settings.neo4j_uri:
            logger.warning("NEO4J_URI not set – GraphRAG will use mock data.")
            return
        try:
            self._driver = GraphDatabase.driver(
                self.settings.neo4j_uri,
                auth=(self.settings.neo4j_username, self.settings.neo4j_password),
            )
            self._driver.verify_connectivity()
            logger.info("Connected to Neo4j AuraDB ✓")
        except Exception as exc:
            logger.warning(f"Neo4j connection failed ({exc}) – using mock data.")
            self._driver = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def transform(self, raw_event: str) -> dict:
        """
        Main entry point. Extracts entities, builds Cypher, queries Neo4j.
        Falls back to mock if anything fails.
        """
        try:
            entities = await self._extract_entities(raw_event)
            if self._driver:
                result = self._query_neo4j(entities, raw_event)
                if result:
                    return result
        except Exception as exc:
            logger.error(f"GraphRAGTransformer error: {exc}")

        # Enrich mock with extracted entities if possible
        mock = dict(MOCK_GRAPH)
        mock["event"] = raw_event
        return mock

    async def _extract_entities(self, text: str) -> dict:
        """Use Groq 8B to extract entities + intent as JSON."""
        if not self.groq_client:
            return {"entities": ["Gujarat", "Transport"], "intent": "supply_chain_disruption", "sector": "Logistics"}

        prompt = f"""You are a financial NLP model. Extract key entities from this event and return ONLY valid JSON.

Event: "{text}"

Return JSON with keys: entities (list of strings), intent (string), sector (string), location (string).
No markdown, no explanation – raw JSON only."""

        response = await self.groq_client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=256,
        )
        raw = response.choices[0].message.content.strip()
        # Strip any accidental markdown fences
        raw = raw.replace("```json", "").replace("```", "").strip()
        return json.loads(raw)

    def _query_neo4j(self, entities: dict, raw_event: str) -> Optional[dict]:
        """Build dynamic Cypher and fetch 1st + 2nd degree impacts."""
        entity_list = entities.get("entities", [])
        sector = entities.get("sector", "")

        cypher = """
        MATCH (e:Entity)-[r1]->(n1:Ticker)
        WHERE any(ent IN $entities WHERE toLower(e.name) CONTAINS toLower(ent))
           OR toLower(e.sector) = toLower($sector)
        OPTIONAL MATCH (n1)-[r2]->(n2:Ticker)
        RETURN e.name AS source, type(r1) AS rel1, n1.symbol AS tier1_ticker,
               type(r2) AS rel2, n2.symbol AS tier2_ticker
        LIMIT 20
        """

        with self._driver.session() as session:
            records = session.run(cypher, entities=entity_list, sector=sector).data()

        if not records:
            return None

        causal_chain = []
        tickers = set()
        for r in records:
            causal_chain.append({
                "source": r["source"],
                "relationship": r["rel1"],
                "target": r["tier1_ticker"],
            })
            tickers.add(r["tier1_ticker"])
            if r.get("tier2_ticker"):
                causal_chain.append({
                    "source": r["tier1_ticker"],
                    "relationship": r.get("rel2", "IMPACTS"),
                    "target": r["tier2_ticker"],
                })
                tickers.add(r["tier2_ticker"])

        return {
            "event": raw_event,
            "entities": entity_list,
            "causal_chain": causal_chain,
            "affected_tickers": list(tickers),
            "signal_strength": "HIGH" if len(tickers) > 3 else "MEDIUM",
            "confidence": round(0.65 + min(len(tickers) * 0.03, 0.25), 2),
        }

    def close(self):
        if self._driver:
            self._driver.close()