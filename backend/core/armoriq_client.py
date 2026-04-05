"""
backend/core/armoriq_client.py

ArmorIQ SDK wrapper.

Provides:
  get_armoriq_client()          — returns the singleton ArmorIQClient (or None if not configured)
  trigger_via_armoriq(topic, graph_context)   — full plan → token → delegate flow
  invoke_tool_via_armoriq(action, parameters) — single tool call via client.invoke()
"""
from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)

_client = None          # ArmorIQClient singleton
_client_checked = False # True once we have attempted to init


def get_armoriq_client():
    """
    Initialize and cache the ArmorIQClient singleton.
    Returns None if credentials are not configured so callers can degrade gracefully.
    """
    global _client, _client_checked

    if _client_checked:
        return _client

    _client_checked = True

    from backend.core.config import get_settings
    s = get_settings()

    if not all([s.armoriq_api_key, s.armoriq_user_id, s.armoriq_agent_id]):
        print("[ArmorIQ] ⚠️ Credentials not configured — ArmorIQ integration disabled")
        logger.warning("[ArmorIQ] Credentials not configured — ArmorIQ integration disabled")
        _client = None
        return None

    try:
        from armoriq_sdk import ArmorIQClient  # type: ignore
        _client = ArmorIQClient(
            api_key=s.armoriq_api_key,
            user_id=s.armoriq_user_id,
            agent_id=s.armoriq_agent_id,
        )
        print(f"[ArmorIQ] ✅ Client initialized (agent_id={s.armoriq_agent_id})")
        logger.info(f"[ArmorIQ] Client initialized (agent_id={s.armoriq_agent_id})")
    except ImportError:
        print("[ArmorIQ] ⚠️ armoriq-sdk not installed — run: pip install armoriq-sdk")
        logger.warning("[ArmorIQ] armoriq-sdk not installed")
        _client = None
    except Exception as exc:
        print(f"[ArmorIQ] ❌ Client init failed: {exc}")
        logger.error(f"[ArmorIQ] Client init failed: {exc}")
        _client = None

    return _client


async def trigger_via_armoriq(topic: str, graph_context: dict) -> dict:
    """
    Full ArmorIQ plan → intent-token → delegate flow.

    Step 1 — capture_plan: describe what the agent intends to do
    Step 2 — get_intent_token: get a signed token for the plan
    Step 3 — delegate: ArmorIQ executes the MCP actions via /mcp endpoint
    """
    client = get_armoriq_client()
    if not client:
        return {"success": False, "error": "ArmorIQ not configured"}

    from backend.core.config import get_settings
    ngrok_url = (get_settings().ngrok_public_url or "").rstrip("/")
    if not ngrok_url:
        return {"success": False, "error": "NGROK_PUBLIC_URL not set in .env"}

    mcp_url = f"{ngrok_url}/mcp"

    try:
        # ── Step 1: capture_plan ─────────────────────────────────────────────
        plan = client.capture_plan(
            prompt=f"Analyze Indian equity market impact of: {topic}",
            mcp_url=mcp_url,
            mcp_actions=[
                {
                    "mcp": "fillado-mcp",
                    "action": "fetch_et_news",
                    "parameters": {"query": topic[:50], "timeframe": "7d"},
                },
                {
                    "mcp": "fillado-mcp",
                    "action": "execute_graphrag_query",
                    "parameters": {"unstructured_query": topic},
                },
                {
                    "mcp": "fillado-mcp",
                    "action": "get_nse_price",
                    "parameters": {"ticker": "NIFTY50"},
                },
            ],
        )
        print(f"[ArmorIQ] Plan captured: {plan}")
        logger.info(f"[ArmorIQ] Plan captured for topic: {topic!r}")

        # ── Step 2: get_intent_token ─────────────────────────────────────────
        token = client.get_intent_token(plan_capture=plan)
        print(f"[ArmorIQ] Intent token obtained")
        logger.info("[ArmorIQ] Intent token obtained")

        # ── Step 3: delegate ─────────────────────────────────────────────────
        result = client.delegate(token)
        print(f"[ArmorIQ] Delegation result: {result}")
        logger.info(f"[ArmorIQ] Delegation complete")

        return {"success": True, "armoriq_result": result, "plan": str(plan)}

    except Exception as exc:
        logger.error(f"[ArmorIQ] trigger_via_armoriq failed: {exc}")
        return {"success": False, "error": str(exc)}


async def invoke_tool_via_armoriq(action: str, parameters: dict) -> dict:
    """
    Single tool invocation via client.invoke() — no plan/token round-trip needed.
    Use this for lightweight tool calls that don't require a full audit trail.
    """
    client = get_armoriq_client()
    if not client:
        return {"success": False, "error": "ArmorIQ not configured"}

    try:
        result = client.invoke(action=action, parameters=parameters)
        print(f"[ArmorIQ] invoke {action} → {result}")
        return {"success": True, "result": result}
    except Exception as exc:
        logger.error(f"[ArmorIQ] invoke_tool_via_armoriq({action}) failed: {exc}")
        return {"success": False, "error": str(exc)}
