# Fillado: The Reality-Anchored Market Intelligence Layer

#### An agentic, cross-lingual market causality engine. Fillado ingests real-time vernacular news, verifies events autonomously using LangGraph, and maps supply-chain disruptions to NSE stock tickers via a Neo4j Knowledge Graph to surface low-latency trading signals.

---

# HLD

(Insert architecture diagram here)

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
