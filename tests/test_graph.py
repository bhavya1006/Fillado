# scripts/debug_causal_graph.py
# Run with: python -m scripts.debug_causal_graph

import asyncio
import json
import re
from backend.core.config import get_settings

from groq import AsyncGroq
from backend.agents.trading_floor import SYNTHESIS_SYSTEM
def _groq_client() -> AsyncGroq:
    return AsyncGroq(api_key=get_settings().groq_api_key)

TEST_TRANSCRIPT = """
[retail]: IOC bullish, delivery volumes up, Israel-Iran war driving oil rally.
[whale]: Supply chain data shows 0.72 confidence disruption to Middle East exports 
         hitting IOC and HPCL. Tier-2 ripple to BPCL at 0.59 confidence.
[contrarian]: IOC down 25% from March high at 134. Short-covering not real demand. 
              Contrarian short justified if Hormuz normalises.
"""

async def debug_causal_graph():
    client = _groq_client()
    
    user_prompt = f"""Event: war between israel and iran

Full Debate Transcript:
{TEST_TRANSCRIPT}

Generate the final trading signal JSON."""

    print("=" * 60)
    print("Sending to synthesis LLM...")
    print("=" * 60)
    
    response = await client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[
            {"role": "system", "content": SYNTHESIS_SYSTEM},
            {"role": "user",   "content": user_prompt},
        ],
        max_tokens=1024,
        reasoning_effort="medium",
    )
    
    raw = response.choices[0].message.content.strip()
    
    print("\n[RAW LLM OUTPUT]:")
    print(raw)
    print("\n" + "=" * 60)
    
    # Test the exact parsing logic from synthesis_node
    print("\n[PARSING TEST]:")
    try:
        clean = raw.replace("```json", "").replace("```", "").strip()
        clean = re.sub(r'<think>.*?</think>', '', clean, flags=re.DOTALL).strip()
        start = clean.find('{')
        end   = clean.rfind('}')
        if start != -1 and end != -1:
            clean = clean[start:end+1]
        signal = json.loads(clean)
        print("✅ json.loads succeeded")
    except Exception as e:
        print(f"❌ json.loads FAILED: {e}")
        print(f"   Attempted to parse: {clean[:200]}")
        return

    # Check for CAUSAL_GRAPH vs old CAUSAL_CHAIN
    print("\n[FIELD CHECK]:")
    expected_fields = [
        "CONSENSUS", "CONFIDENCE_PCT", "PRIMARY_TICKER",
        "SECONDARY_TICKERS", "TIME_HORIZON", "RATIONALE", "CAUSAL_GRAPH"
    ]
    for field in expected_fields:
        val = signal.get(field)
        status = "✅" if val is not None else "❌ MISSING"
        print(f"  {status} {field}: {str(val)[:80]}")

    # Validate CAUSAL_GRAPH structure
    print("\n[CAUSAL_GRAPH VALIDATION]:")
    causal_graph = signal.get("CAUSAL_GRAPH", [])
    
    if not isinstance(causal_graph, list):
        print(f"❌ CAUSAL_GRAPH is not a list — got: {type(causal_graph)}")
        # Check old format fallback
        chain_str = signal.get("CAUSAL_CHAIN", "")
        if chain_str:
            print(f"⚠️  Old CAUSAL_CHAIN string found: {chain_str}")
            parts = [p.strip() for p in str(chain_str).split("➜")]
            print(f"   Splits into {len(parts)} parts: {parts}")
        return

    print(f"✅ CAUSAL_GRAPH is a list with {len(causal_graph)} links")
    
    required_link_keys = ["source", "relationship", "target", "tier", "confidence"]
    issues = []
    
    for i, link in enumerate(causal_graph):
        print(f"\n  Link {i+1}:")
        for key in required_link_keys:
            val = link.get(key)
            if val is None:
                print(f"    ❌ MISSING '{key}'")
                issues.append(f"Link {i+1} missing '{key}'")
            else:
                # Type checks
                if key == "tier":
                    if not isinstance(val, int) or val not in [1, 2, 3]:
                        print(f"    ⚠️  '{key}' = {val!r} (expected int 1/2/3)")
                        issues.append(f"Link {i+1} bad tier: {val!r}")
                    else:
                        print(f"    ✅ tier={val}")
                elif key == "confidence":
                    if not isinstance(val, (int, float)) or not (0 <= val <= 1):
                        print(f"    ⚠️  '{key}' = {val!r} (expected float 0-1)")
                        issues.append(f"Link {i+1} bad confidence: {val!r}")
                    else:
                        print(f"    ✅ confidence={val}")
                elif key == "relationship":
                    if val != val.upper() or ' ' in val:
                        print(f"    ⚠️  '{key}' = {val!r} (expected SCREAMING_SNAKE_CASE)")
                        issues.append(f"Link {i+1} bad relationship format: {val!r}")
                    else:
                        print(f"    ✅ relationship={val}")
                else:
                    print(f"    ✅ {key}={str(val)[:50]}")

    print("\n" + "=" * 60)
    if issues:
        print(f"⚠️  {len(issues)} issues found:")
        for issue in issues:
            print(f"   - {issue}")
    else:
        print(f"✅ All {len(causal_graph)} links are valid")
        
    # Simulate the write loop without actually hitting Neo4j
    print("\n[SIMULATED WRITE LOOP]:")
    written, failed = 0, 0
    for link in causal_graph:
        source = link.get("source", "").strip()
        target = link.get("target", "").strip()
        rel    = link.get("relationship", "").strip()
        tier   = link.get("tier", 1)
        conf   = link.get("confidence", 0.75)
        
        if not source or not target:
            print(f"  ❌ SKIP — empty source or target: {link}")
            failed += 1
            continue
            
        print(f"  Would write: [{tier}] {source} ─[{rel}]→ {target} (conf={conf})")
        written += 1
    
    print(f"\n  Simulated: written={written} failed={failed}")

if __name__ == "__main__":
    asyncio.run(debug_causal_graph())