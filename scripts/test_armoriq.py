# scripts/test_armoriq.py
# Run with: python -m scripts.test_armoriq

import asyncio
from backend.core.armoriq_client import trigger_via_armoriq, get_armoriq_client


async def main():
    print("=" * 60)
    print("ARMORIQ INTEGRATION TEST")
    print("=" * 60)

    # Test 1 — client init
    client = get_armoriq_client()
    print(f"\n[1] Client init: {'✅ configured' if client else '❌ not configured'}")

    # Test 2 — MCP health check via httpx
    import httpx
    from backend.core.config import get_settings
    ngrok_url = (get_settings().ngrok_public_url or "").rstrip("/")
    if ngrok_url:
        async with httpx.AsyncClient() as http:
            try:
                r = await http.get(f"{ngrok_url}/mcp/health", timeout=5)
                print(f"[2] MCP health: ✅ {r.json()}")
            except Exception as e:
                print(f"[2] MCP health: ❌ {e} — is ngrok running?")
    else:
        print("[2] MCP health: ⚠️ NGROK_PUBLIC_URL not set in .env")

    # Test 3 — MCP manifest endpoint
    if ngrok_url:
        async with httpx.AsyncClient() as http:
            try:
                r = await http.get(f"{ngrok_url}/mcp/manifest", timeout=5)
                manifest = r.json()
                tools = [t["name"] for t in manifest.get("tools", [])]
                print(f"[3] MCP manifest: ✅ {len(tools)} tools: {tools}")
            except Exception as e:
                print(f"[3] MCP manifest: ❌ {e}")
    else:
        print("[3] MCP manifest: ⚠️ NGROK_PUBLIC_URL not set — skipping")

    # Test 4 — single MCP action dispatch directly
    if ngrok_url:
        async with httpx.AsyncClient() as http:
            try:
                r = await http.post(
                    f"{ngrok_url}/mcp",
                    json={"action": "get_nse_price_mock", "parameters": {"ticker": "ADANIPORTS"}},
                    timeout=10,
                )
                print(f"[4] MCP dispatch (mock): ✅ status={r.status_code}")
            except Exception as e:
                print(f"[4] MCP dispatch: ❌ {e}")
    else:
        print("[4] MCP dispatch: ⚠️ NGROK_PUBLIC_URL not set — skipping")

    # Test 5 — full ArmorIQ plan → token → delegate flow
    if client:
        result = await trigger_via_armoriq(
            topic="test: hosur factory strike",
            graph_context={},
        )
        print(f"\n[5] ArmorIQ flow: {'✅' if result.get('success') else '❌'}")
        print(f"    Result: {result}")
    else:
        print("[5] ArmorIQ flow: ⚠️ skipped — client not configured")


if __name__ == "__main__":
    asyncio.run(main())
