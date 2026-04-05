# Fillado: The Reality-Anchored Market Intelligence Layer

#### An agentic, cross-lingual market causality engine. Fillado ingests real-time vernacular news, verifies events autonomously using LangGraph, and maps supply-chain disruptions to NSE stock tickers via a Neo4j Knowledge Graph to surface low-latency trading signals.

---

# HLD

<img width="680" height="1820" alt="llm_trading_architecture 1" src="https://github.com/user-attachments/assets/e21cdd09-c139-45a6-8b31-e90bde6df99e" />


---

# Product Requirements Document (PRD)

## 1. The Core Vision: What Are We Solving?

We are building a system that finds hidden market opportunities while actively preventing AI hallucinations.

### The Investor Problem
Retail investors react to mainstream English news *after* institutional players have already moved the market. They miss hidden supply-chain effects caused by local events.

### The AI Problem
AI agents analyzing markets often hallucinate, create false causal links, and waste compute. Most systems are static and don’t evolve with new market relationships.

### The Solution
Fillado is an agentic intelligence layer that detects vernacular supply-chain disruptions (e.g., a regional news report of a factory strike) before mainstream markets react.

The system:
- Drops events into a **multi-agent debate system**
- Uses a **“Thought Policeman” middleware** to prevent hallucinations
- Forces grounding using real-world data when needed
- Learns new market relationships via a **Synthesis Agent**
- Continuously updates a **Neo4j Knowledge Graph**

---

## 2. Unique Selling Propositions (USPs)

- **Latency Arbitrage:** Converts regional news into early trading signals  
- **Transparent AI Reasoning:** Multi-agent debate system simulating market perspectives  
- **Reality-Anchored Middleware:** Detects and stops hallucinations in real-time  
- **Self-Learning Knowledge Graph:** Continuously evolves with new causal links  
- **Real-Time Delivery:** Instant alerts via WebSockets  

---

## 3. Feature Detailing

### Feature A: Vernacular Scout & Base Graph
- Scrapes regional news (Hindi, Tamil, Telugu)
- Extracts events + locations
- Maps them onto a Neo4j knowledge graph  

**Output Example:**  
`Strike → Hosur → Ashok Leyland Factory`

---

### Feature B: Agentic Trading Floor (Debate)
- Multiple AI personas debate the event:
  - Retail Trader  
  - Institutional Investor  
  - Contrarian  

- Runs for structured turns  

**Outcome:**  
Discovers second-order effects  
(e.g., production slowdown → supplier impact)

---

### Feature C: Thought Policeman Middleware
- Monitors agent outputs in real-time  
- Uses a lightweight model to detect:
  - Hallucinations  
  - Context drift  

If triggered:
- Stops generation immediately  
- Forces agent to fetch real-world data  

---

### Feature D: Dynamic Graph Updater
- A **Synthesis Agent** analyzes debate results  
- Extracts validated causal relationships  
- Writes them into Neo4j  

**Example:**  
`Ashok Leyland Strike → Impacts → MRF Tires`

---

## 4. MCP Server & Tools

### Read Tools
- `fetch_news(query, timeframe)`  
- `get_market_price(ticker)`  
- `run_backtest(pattern, ticker)`  

### Write Tools
- `append_causal_link(source, relation, target)`  

---

## 5. User Flow

### Step 1: Dashboard
- Live feed of opportunity alerts  

### Step 2: Event Trigger
- User clicks alert  
- Example: *Transport Strike in Gujarat*  

### Step 3: Trading Floor
- AI debate streams in real-time  
- Hallucination corrections shown visually  

### Step 4: Graph Update
- System learns new relationships  
- Displays updated connections  

### Step 5: Action
- Final signal + supporting data shown  

---

## 6. High-Level Architecture

1. **Ingestion Layer**  
   - Scrapes regional news  

2. **Middleware Proxy**  
   - Detects hallucinations  
   - Enforces grounding  

3. **Reasoning Layer (LangGraph)**  
   - Multi-agent debate  
   - Synthesis agent  

4. **Knowledge Core (Neo4j + MCP)**  
   - Stores evolving relationships  
   - Executes tools  

5. **Delivery Layer (FastAPI + WebSockets)**  
   - Streams alerts + updates  

---

## 7. APIs, Validation, and Fallbacks

### APIs
- Market data via open-source tools  

### Validation
- Requires cross-source verification before signals  

### Fallbacks
- Backup LLMs if rate-limited  
- Historical data if live feeds fail  

---

## 8. Setup Instructions

### Frontend Setup (Terminal 1)
```bash
cd .\frontend\
npm run dev
```

### Backend Setup (Terminal 2)
```powershell
python --version
# Should output Python 3.13.12 or similar
python -m venv .venv
.\.venv\Scripts\activate
cd backend
pip install -r requirements.txt
cd ..
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

---

# ArmorIQ + Fillado MCP — Setup Guide

## What is this?

[ArmorIQ](https://platform.armoriq.ai) is an AI governance layer that adds
plan-capture, intent-token validation, and audited delegation to your existing
tool calls. Fillado exposes its NSE data + knowledge-graph tools as an MCP
server so ArmorIQ can call them with full observability.

---

## Prerequisites

- Fillado backend running (`uvicorn backend.main:app --port 8000`)
- [ngrok](https://ngrok.com) installed (`choco install ngrok` on Windows)
- An [ArmorIQ account](https://platform.armoriq.ai)
- `armoriq-sdk` installed (see Step 1)

---

## Step-by-step Setup

### Step 1 — Install armoriq-sdk

```bash
pip install armoriq-sdk
```

### Step 2 — Start ngrok

Open a **separate terminal** and run:

```bash
ngrok http 8000
```

Copy the **Forwarding HTTPS URL** — it looks like:

```
https://abc123def456.ngrok-free.app
```

### Step 3 — Configure .env

Add these lines to your `.env` file (see `.env.example`):

```env
# ArmorIQ credentials (get from platform.armoriq.ai → Settings → API Keys)
ARMORIQ_API_KEY=your_armoriq_api_key_here
ARMORIQ_USER_ID=your_armoriq_user_id_here
ARMORIQ_AGENT_ID=your_armoriq_agent_id_here

# ngrok public URL (update every time you restart ngrok)
NGROK_PUBLIC_URL=https://abc123def456.ngrok-free.app
```

### Step 4 — Restart the backend

```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

You should see on startup:

```
[MCP HTTP] Endpoint live at /mcp
[ArmorIQ] ✅ Client initialized (agent_id=...)
```

### Step 5 — Verify MCP endpoints are publicly reachable

```bash
curl https://abc123def456.ngrok-free.app/mcp/health
# → {"status":"ok","tools":["get_nse_price","fetch_et_news",...]}

curl https://abc123def456.ngrok-free.app/mcp/manifest
# → {"name":"fillado-mcp","version":"1.0.0","tools":[...]}
```

### Step 6 — Register on ArmorIQ platform

1. Go to [platform.armoriq.ai](https://platform.armoriq.ai) → **MCP Directory**
2. Click **Register MCP Server**
3. Set **Name** = `fillado-mcp`
4. Set **Manifest URL** = `https://abc123def456.ngrok-free.app/mcp/manifest`
5. ArmorIQ will auto-read the tool schemas from your manifest
6. Save — your tools are now available to the ArmorIQ agent runtime

> Reference: [ArmorIQ MCP Directory docs](https://docs.armoriq.ai/docs/mcp-directory)

### Step 7 — Run the integration test

```bash
python -m scripts.test_armoriq
```

Expected output:

```
[1] Client init: ✅ configured
[2] MCP health: ✅ {"status": "ok", "tools": [...]}
[3] MCP manifest: ✅ 5 tools: [...]
[4] MCP dispatch (mock): ✅ status=200
[5] ArmorIQ flow: ✅
```

---

## Using the ArmorIQ endpoint

Instead of the standard debate endpoint:

```bash
POST /api/trigger-event
```

Use the ArmorIQ-enhanced endpoint which **runs both concurrently**:

```bash
POST /api/trigger-event-armoriq
Content-Type: application/json

{ "event": "SEBI tightens F&O margin rules" }
```

The response includes both the LangGraph debate result **and** the ArmorIQ
plan/delegation audit trail. A `armoriq_plan` WebSocket event is also broadcast
to the frontend.

---

## Architecture

```
Frontend (React)
     │
     ├─ POST /api/trigger-event-armoriq
     │        │
     │        ├─ asyncio.gather(
     │        │     trigger_via_armoriq()   ← ArmorIQ plan → token → delegate
     │        │     run_trading_floor()     ← existing LangGraph debate (unchanged)
     │        │  )
     │        │
     │        └─ broadcast armoriq_plan via WebSocket
     │
     └─ GET  /mcp/manifest   ← ArmorIQ reads tool schemas here
        POST /mcp            ← ArmorIQ calls tools here (via ngrok tunnel)
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `[ArmorIQ] ⚠️ Credentials not configured` | Add `ARMORIQ_API_KEY`, `ARMORIQ_USER_ID`, `ARMORIQ_AGENT_ID` to `.env` |
| `[ArmorIQ] ⚠️ armoriq-sdk not installed` | Run `pip install armoriq-sdk` |
| MCP health returns 404 | Check that backend restarted after the latest code changes |
| ngrok tunnel expired | Restart `ngrok http 8000` and update `NGROK_PUBLIC_URL` in `.env` |
| ArmorIQ can't reach `/mcp` | Make sure you're using the **HTTPS** ngrok URL, not HTTP |
