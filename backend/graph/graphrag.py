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
from backend.core.key_manager import (
    get_groq_client,
    get_neo4j_credentials,
    report_groq_error,
    report_groq_success,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Mock fallback graph – used when Neo4j creds are not configured
# ---------------------------------------------------------------------------
MOCK_GRAPH = {
    "event": "Transport Strike in Gujarat",
    "entities": ["Gujarat", "Transport", "Logistics"],
    "causal_chain": [
        {"source": "Transport Strike", "relationship": "DISRUPTS", "target": "Gujarat Logistics", "tier": 1, "confidence": 0.85},
        {"source": "Gujarat Logistics", "relationship": "DELAYS", "target": "ADANIPORTS", "tier": 2, "confidence": 0.70},
        {"source": "Gujarat Logistics", "relationship": "IMPACTS", "target": "GUJGASLTD", "tier": 2, "confidence": 0.70},
        {"source": "ADANIPORTS", "relationship": "SUPPLY_CHAIN_RISK", "target": "MUNDRA_PORT", "tier": 3, "confidence": 0.70},
        {"source": "Gujarat Logistics", "relationship": "RIPPLES", "target": "CONCOR", "tier": 3, "confidence": 0.70},
    ],
    "affected_tickers": ["ADANIPORTS", "GUJGASLTD", "CONCOR", "MAHLOG"],
    "signal_strength": "HIGH",
    "confidence": 0.82,
}

_REQUIRED_KEYS = {"entities", "causal_chain", "affected_tickers", "intent", "sector"}
_VALID_TIERS = {1, 2, 3}


def _validate_causal_chain(raw_chain: list) -> list:
    """Filter malformed causal links and return only valid ones."""
    valid = []
    for link in raw_chain:
        source = link.get("source", "")
        relationship = link.get("relationship", "")
        target = link.get("target", "")
        tier = link.get("tier")
        confidence = link.get("confidence")

        ok = (
            isinstance(source, str) and source.strip()
            and isinstance(relationship, str) and relationship.strip()
            and isinstance(target, str) and target.strip()
            and isinstance(tier, int) and tier in _VALID_TIERS
            and isinstance(confidence, float) and 0.0 <= confidence <= 1.0
        )
        if ok:
            valid.append(link)
        else:
            print(f"[GraphRAG FALLBACK] Dropping malformed causal link: {link}")
    return valid


class GraphRAGTransformer:
    """
    Transforms an unstructured vernacular event description into a structured
    Neo4j sub-graph query, executes it, and returns causal context for agents.
    """

    def __init__(self):
        self.settings = get_settings()
        # Do NOT fix a Groq client at construction time — call get_groq_client()
        # inside _extract_entities so every call rotates to the next healthy key.
        self.groq_client = None
        self._driver = None
        self._init_neo4j()

    def _init_neo4j(self):
        try:
            uri, user, pwd = get_neo4j_credentials()
        except Exception:
            uri, user, pwd = self.settings.neo4j_uri, self.settings.neo4j_username, self.settings.neo4j_password

        if not uri:
            logger.warning("NEO4J_URI not set – GraphRAG will use mock data.")
            return
        try:
            self._driver = GraphDatabase.driver(uri, auth=(user, pwd))
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
        Main entry point. Extracts entities + hierarchical causal graph, queries Neo4j.
        Falls back to dynamic entity-chain if anything fails.
        """
        entities: dict = {}
        try:
            entities = await self._extract_entities(raw_event)
            if self._driver:
                entity_list = entities.get("entities", [])
                result = self._query_neo4j(entities, raw_event)
                if result:
                    return result
                else:
                    print(f"[GraphRAG FALLBACK] Neo4j returned no records for entities: {entity_list}")
        except Exception as exc:
            logger.error(f"GraphRAGTransformer error: {exc}")

        # ── Dynamic fallback: use LLM-extracted causal_chain if present ──
        extracted_entities = entities.get("entities", [])
        extracted_chain = entities.get("causal_chain", [])

        if extracted_chain:
            return {
                "event": raw_event,
                "entities": extracted_entities,
                "causal_chain": extracted_chain,
                "affected_tickers": entities.get("affected_tickers", []),
                "signal_strength": "MEDIUM",
                "confidence": 0.60,
                "intent": entities.get("intent", ""),
                "sector": entities.get("sector", ""),
            }

        # ── Dynamic entity-chain fallback (no hardcoded MARKET_VOLATILITY) ──
        if extracted_entities:
            print("[GraphRAG FALLBACK] Building dynamic entity chain fallback — causal_chain was empty")
            dynamic_chain = []
            for i in range(len(extracted_entities) - 1):
                dynamic_chain.append({
                    "source": extracted_entities[i],
                    "relationship": "IMPACTS",
                    "target": extracted_entities[i + 1],
                    "tier": 1,
                    "confidence": 0.50,
                })
            return {
                "event": raw_event,
                "entities": extracted_entities,
                "causal_chain": dynamic_chain,
                "affected_tickers": [],
                "signal_strength": "UNCERTAIN",
                "confidence": 0.50,
                "intent": entities.get("intent", ""),
                "sector": entities.get("sector", ""),
            }

        # ── Last resort: MOCK_GRAPH with reason logged ──
        print(f"[GraphRAG FALLBACK] Using MOCK_GRAPH — reason: no entities extracted from event")
        mock = dict(MOCK_GRAPH)
        mock["event"] = raw_event
        return mock

    async def _extract_entities(self, text: str) -> dict:
        """Use Groq 8B to extract entities + full hierarchical causal graph as JSON.
        A fresh client (and thus fresh key) is obtained on every call via get_groq_client().
        """
        groq_client = get_groq_client()
        if not groq_client:
            return {
                "entities": ["Gujarat", "Transport"],
                "causal_chain": [
                    {"source": "Gujarat", "relationship": "IMPACTS", "target": "Transport", "tier": 1, "confidence": 0.50},
                ],
                "affected_tickers": [],
                "intent": "supply_chain_disruption",
                "sector": "Logistics",
            }
        used_key = groq_client.api_key

        prompt = f"""You are a financial NLP model specialising in Indian equity markets.
Extract a full hierarchical causal graph from the market event below.

Event: "{text}"

Return a JSON object with these exact top-level keys:
  entities          — list of strings (key actors, commodities, regions)
  causal_chain      — list of causal link objects (minimum 5 links, see rules below)
  affected_tickers  — list of NSE ticker symbol strings
  intent            — one-word string, e.g. supply_chain_disruption
  sector            — string, e.g. Logistics

Causal chain rules:
  • Each link object must have exactly: source, relationship, target, tier, confidence
  • relationship must be a SCREAMING_SNAKE_CASE verb from this set only:
      DISRUPTS, DELAYS, IMPACTS, SUPPLY_CHAIN_RISK, RIPPLES
  • tier must be an integer 1, 2, or 3 — NEVER a string like "Tier 1"
  • confidence must be a float between 0.0 and 1.0 — NEVER a percentage string like "85%"
  • Tier 1 = event/actor → directly disrupted entity (confidence ≈ 0.85)
  • Tier 2 = disrupted entity → affected NSE ticker (confidence ≈ 0.70)
  • Tier 3 = affected ticker → downstream ticker or sector (confidence ≈ 0.60)

Few-shot example (for an unrelated event — do NOT copy these values):
{{
  "entities": ["Cyclone Biparjoy", "Kandla Port", "Gujarat"],
  "causal_chain": [
    {{"source": "Cyclone Biparjoy", "relationship": "DISRUPTS", "target": "Kandla Port Operations", "tier": 1, "confidence": 0.88}},
    {{"source": "Kandla Port Operations", "relationship": "DELAYS", "target": "ADANIPORTS", "tier": 2, "confidence": 0.72}},
    {{"source": "Kandla Port Operations", "relationship": "IMPACTS", "target": "GUJGASLTD", "tier": 2, "confidence": 0.68}},
    {{"source": "ADANIPORTS", "relationship": "SUPPLY_CHAIN_RISK", "target": "CONCOR", "tier": 3, "confidence": 0.61}},
    {{"source": "GUJGASLTD", "relationship": "RIPPLES", "target": "IGL", "tier": 3, "confidence": 0.55}}
  ],
  "affected_tickers": ["ADANIPORTS", "GUJGASLTD", "CONCOR", "IGL"],
  "intent": "port_disruption",
  "sector": "Logistics"
}}

Now extract from the actual event above. Return ONLY the raw JSON object, no markdown fences, no backticks, no explanation text before or after, starting directly with the opening curly brace."""

        try:
            response = await groq_client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=600,
            )
            raw = response.choices[0].message.content.strip()
            # Strip any accidental markdown fences
            raw = raw.replace("```json", "").replace("```", "").strip()
            report_groq_success(used_key)
        except Exception as exc:
            report_groq_error(used_key)
            print(f"[GraphRAG FALLBACK] Groq call threw {type(exc).__name__}: {exc}")
            return {"entities": [], "causal_chain": [], "affected_tickers": [], "intent": "", "sector": ""}

        try:
            parsed = json.loads(raw)
        except Exception as exc:
            print(f"[GraphRAG FALLBACK] json.loads failed — raw LLM output was: {raw}")
            return {"entities": [], "causal_chain": [], "affected_tickers": [], "intent": "", "sector": ""}

        # ── Validate top-level keys ──────────────────────────────────────────
        missing = [k for k in _REQUIRED_KEYS if k not in parsed]
        if missing:
            print(f"[GraphRAG FALLBACK] Missing keys in LLM response: {missing} — raw: {raw}")
            for k in missing:
                if k == "entities":
                    parsed[k] = []
                elif k == "causal_chain":
                    parsed[k] = []
                elif k == "affected_tickers":
                    parsed[k] = []
                elif k == "intent":
                    parsed[k] = ""
                elif k == "sector":
                    parsed[k] = ""

        # ── Validate each causal link ────────────────────────────────────────
        parsed["causal_chain"] = _validate_causal_chain(parsed.get("causal_chain", []))

        return parsed

    def _query_neo4j(self, entities: dict, raw_event: str) -> Optional[dict]:
        """Build dynamic Cypher and fetch 1st + 2nd degree impacts with tier/confidence."""
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
            if r.get("tier1_ticker"):
                causal_chain.append({
                    "source": r["source"],
                    "relationship": r["rel1"],
                    "target": r["tier1_ticker"],
                    "tier": 1,
                    "confidence": 0.85,
                })
                tickers.add(r["tier1_ticker"])
            if r.get("tier2_ticker"):
                causal_chain.append({
                    "source": r["tier1_ticker"],
                    "relationship": r.get("rel2", "IMPACTS"),
                    "target": r["tier2_ticker"],
                    "tier": 2,
                    "confidence": 0.70,
                })
                tickers.add(r["tier2_ticker"])

        return {
            "event": raw_event,
            "entities": entity_list,
            "causal_chain": causal_chain,
            "affected_tickers": list(tickers),
            "signal_strength": "HIGH" if len(tickers) > 3 else "MEDIUM",
            "confidence": round(0.65 + min(len(tickers) * 0.03, 0.25), 2),
            "intent": entities.get("intent", ""),
            "sector": entities.get("sector", ""),
        }

    def close(self):
        if self._driver:
            self._driver.close()
