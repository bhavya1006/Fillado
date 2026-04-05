import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import AgentNode from './AgentNode'
import SpeechBubble from './SpeechBubble'
import HallucinationBadge from './HallucinationBadge'
import GraphViz from './GraphViz'
import TradingSignal from './TradingSignal'
import StockChart from './StockChart'
import ReactMarkdown from 'react-markdown'

// ─────────────────────────────────────────────────────────────────────────────
// The 3 debate personas in their fixed clockwise order.
// The "active speaker" rotates to the TOP-RIGHT position.
// Triangle layout:
//   position 0 → TOP-RIGHT  (the "active speaker" slot)
//   position 1 → BOTTOM
//   position 2 → TOP-LEFT
// ─────────────────────────────────────────────────────────────────────────────
const PERSONAS = ['retail', 'whale', 'contrarian']
const PERSONA_ORDER_MAP = { retail: 0, whale: 1, contrarian: 2 }

// Triangle vertex positions (relative to centre of a 280px container)
// Position 0 = top-right (~1 o'clock), 1 = bottom-centre, 2 = top-left
const TRIANGLE_POSITIONS = [
  { x: 110, y: -90 },  // top-right  (active speaker slot)
  { x: 0, y: 100 },  // bottom-centre
  { x: -110, y: -90 }, // top-left
]

function getRotationForSpeaker(speaker) {
  // We rotate the whole triangle so speaker lands in slot 0 (top-right).
  // Each persona is naturally 120° apart.
  const idx = PERSONA_ORDER_MAP[speaker] ?? 0
  return -idx * 120  // degrees — negative = counter-clockwise rotation
}

// ─────────────────────────────────────────────────────────────────────────────

export default function TradingFloor({ messages, lastMessage, wsStatus }) {
  // ── State ──────────────────────────────────────────
  const [currentSpeaker, setCurrentSpeaker] = useState('retail')
  const [transcripts, setTranscripts] = useState({
    retail: '', whale: '', contrarian: '', synthesis: '',
  })
  // Maintain a chronological array of all completed turns for the history list
  const [chatHistory, setChatHistory] = useState([])
  // Typewriter state
  const [typewriterTarget, setTypewriterTarget] = useState(null) // {speaker, text}
  const typewriterRef = useRef(null)
  const typewriterIdx = useRef(0)
  const [hallucinationEvents, setHallucinationEvents] = useState([])
  const [latestHallucination, setLatestHallucination] = useState(null)
  const [showBadge, setShowBadge] = useState(false)
  const [mcpTool, setMcpTool] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [graphContext, setGraphContext] = useState({})
  const [finalSignal, setFinalSignal] = useState(null)
  const [causalChain, setCausalChain] = useState([])
  const [debatePhase, setDebatePhase] = useState('idle')
  const [mcpToolCalls, setMcpToolCalls] = useState([])
  const [rotationDeg, setRotationDeg] = useState(0)
  const [errorMsg, setErrorMsg] = useState(null)
  const [stockCharts, setStockCharts] = useState({})
  const [debateMode, setDebateMode] = useState('SHOWDOWN')

  const badgeTimer = useRef(null)
  const scrollRef = useRef(null)
  const mcpRef = useRef(null)

  // ── Process incoming WS messages ───────────────────
  useEffect(() => {
    if (!lastMessage) return

    const msg = lastMessage

    switch (msg.type) {
      case 'debate_start':
        setDebatePhase('debating')
        setTranscripts({ retail: '', whale: '', contrarian: '', synthesis: '' })
        setChatHistory([])
        setFinalSignal(null)
        setCausalChain([])
        setHallucinationEvents([])
        setMcpToolCalls([])
        setStockCharts({})
        setErrorMsg(null)
        if (msg.mode) setDebateMode(msg.mode)
        break

      case 'speaker_change': {
        const spk = msg.speaker
        setCurrentSpeaker(spk)
        setIsStreaming(true)

        if (PERSONAS.includes(spk)) {
          const targetDeg = getRotationForSpeaker(spk)
          setRotationDeg(targetDeg)
        }
        break
      }

      // ── New: full buffered response from backend, fake-stream it ──
      case 'agent_response': {
        const { speaker, content } = msg
        if (!speaker || !content) break
        // Append full turn to chronological chat history
        setChatHistory(prev => [...prev, { speaker, content, id: Date.now() + Math.random() }])
        // Kick off typewriter effect for the active speaker
        setTypewriterTarget({ speaker, text: content })
        typewriterIdx.current = 0
        setTranscripts(prev => ({ ...prev, [speaker]: '' })) // reset for fresh animation
        break
      }

      // Legacy token handler kept for backwards compat (mock bursts etc)
      case 'token':
        if (msg.speaker && msg.content && !typewriterRef.current) {
          setTranscripts(prev => ({
            ...prev,
            [msg.speaker]: (prev[msg.speaker] || '') + msg.content,
          }))
        }
        break

      case 'hallucination_detected': {
        const event = { speaker: msg.speaker, timestamp: Date.now() }
        setHallucinationEvents(prev => [...prev, event])
        setLatestHallucination(event)
        setShowBadge(true)
        clearTimeout(badgeTimer.current)
        badgeTimer.current = setTimeout(() => setShowBadge(false), 7000)
        break
      }

      case 'mcp_tool': {
        // Build a richer label from the tool data
        const d = msg.data || {}
        let detail = ''
        if (d.tier) detail += ` [tier ${d.tier}]`
        if (d.mode) detail += ` ${d.mode}`
        if (d.current_price) detail += ` ₹${d.current_price}`
        if (d.change_pct != null) detail += ` (${d.change_pct > 0 ? '+' : ''}${(+d.change_pct).toFixed(2)}%)`
        if (d.article_count != null) detail += ` • ${d.article_count} articles`
        if (d.grounding_summary) detail += ` — ${String(d.grounding_summary).slice(0, 80)}`
        const call = { tool: msg.tool, detail: detail.trim(), data: d, timestamp: Date.now() }
        setMcpToolCalls(prev => [...prev, call])
        setMcpTool(msg.tool)
        break
      }

      case 'stock_chart': {
        const { ticker, data, current_price, change_pct, mode: chartMode } = msg
        if (ticker && data) {
          setStockCharts(prev => ({
            ...prev,
            [ticker]: { data, currentPrice: current_price, changePct: change_pct, mode: chartMode },
          }))
        }
        break
      }

      case 'synthesis_complete':
        setFinalSignal(msg.signal || {})
        if (msg.causal_chain) setCausalChain(msg.causal_chain)
        setIsStreaming(false)
        setDebatePhase('complete')

        // Automatically save to debate history
        {
          const savedDebates = JSON.parse(localStorage.getItem('fillado_debates') || '[]')
          const newEntry = {
            id: Date.now(),
            event: msg.signal?.event || 'Archived Debate',
            signal: msg.signal,
            causal_chain: msg.causal_chain,
            timestamp: new Date().toISOString()
          }
          localStorage.setItem('fillado_debates', JSON.stringify([newEntry, ...savedDebates]))
        }
        break

      case 'debate_end':
        setIsStreaming(false)
        break

      case 'error':
        setErrorMsg(msg.message)
        setIsStreaming(false)
        setDebatePhase('complete')
        break

      default:
        break
    }
  }, [lastMessage])

  // ── Typewriter effect: drip typewriterTarget.text into transcripts ──
  useEffect(() => {
    if (!typewriterTarget) return
    if (typewriterRef.current) {
      clearInterval(typewriterRef.current)
      typewriterRef.current = null
    }
    const { speaker, text } = typewriterTarget
    typewriterIdx.current = 0
    const CHUNK = 4 // chars per tick — feels fast but not instant
    typewriterRef.current = setInterval(() => {
      const idx = typewriterIdx.current
      if (idx >= text.length) {
        clearInterval(typewriterRef.current)
        typewriterRef.current = null
        setIsStreaming(false)
        return
      }
      const next = idx + CHUNK
      setTranscripts(prev => ({ ...prev, [speaker]: text.slice(0, next) }))
      typewriterIdx.current = next
    }, 18) // ~220 chars/sec
    return () => { if (typewriterRef.current) clearInterval(typewriterRef.current) }
  }, [typewriterTarget])

  // Auto-scroll transcript and MCP panels
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [transcripts])

  useEffect(() => {
    if (mcpRef.current) mcpRef.current.scrollTop = mcpRef.current.scrollHeight
  }, [mcpToolCalls])

  // ── Derive active transcript text ──────────────────
  const activeSpeakerText = transcripts[currentSpeaker] || ''
  const isHallucinatedSpeaker = hallucinationEvents.some(
    e => e.speaker?.toLowerCase().includes(currentSpeaker)
  )

  // ── Render ─────────────────────────────────────────
  return (
    <div style={{ position: 'relative', minHeight: 400 }}>

      {/* ── Error Banner ── */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              position: 'absolute', top: -10, left: 0, right: 0, zIndex: 100,
              background: 'rgba(229,56,79,0.12)', border: '1px solid rgba(229,56,79,0.4)',
              borderRadius: 2, padding: '12px 16px', color: 'var(--accent-crimson)',
              display: 'flex', alignItems: 'center', gap: 10,
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              fontFamily: 'var(--font-mono)', fontSize: '0.8rem',
            }}
          >
            <span>▲</span>
            <span style={{ fontWeight: 600 }}>{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              marginLeft: 'auto', cursor: 'pointer', fontSize: '0.9rem',
            }}>✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Hallucination badge (fixed top-right) ── */}
      <HallucinationBadge
        visible={showBadge}
        speaker={latestHallucination?.speaker}
        tool={mcpTool}
        count={hallucinationEvents.length}
      />

      {/* ── Phase header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{
          fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em',
          color: debatePhase === 'debating' ? 'var(--accent-jade)' : debatePhase === 'complete' ? 'var(--accent-gold)' : 'var(--text-muted)',
          textTransform: 'uppercase',
          display: 'flex', alignItems: 'center', gap: 8,
          fontFamily: 'var(--font-mono)',
        }}>
          {debatePhase === 'debating' && (
            <motion.span
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 0.9, repeat: Infinity }}
              style={{
                display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                background: 'var(--accent-jade)',
                boxShadow: '0 0 6px rgba(61,214,140,0.5)',
              }}
            />
          )}
          {debatePhase === 'idle' && '◎ Awaiting debate trigger'}
          {debatePhase === 'debating' && 'Live Debate — Agentic Trading Floor'}
          {debatePhase === 'complete' && '✓ Debate Complete — Signal Generated'}
        </div>
        {debatePhase !== 'idle' && (
          <span style={{
            fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em',
            padding: '2px 8px', borderRadius: 2,
            fontFamily: 'var(--font-mono)',
            background: debateMode === 'LIVE' ? 'rgba(61,214,140,0.08)' : 'rgba(212,175,55,0.08)',
            border: `1px solid ${debateMode === 'LIVE' ? 'rgba(61,214,140,0.25)' : 'rgba(212,175,55,0.25)'}`,
            color: debateMode === 'LIVE' ? 'var(--accent-jade)' : 'var(--accent-gold)',
          }}>
            {debateMode === 'LIVE' ? '⚡ LIVE AI' : '◎ SHOWDOWN'}
          </span>
        )}

        {hallucinationEvents.length > 0 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            style={{
              background: 'rgba(229,56,79,0.06)',
              border: '1px solid rgba(229,56,79,0.25)',
              borderRadius: 2, padding: '3px 10px',
              fontSize: '0.62rem', color: 'var(--accent-crimson)',
              fontWeight: 700, fontFamily: 'var(--font-mono)',
            }}
          >
            ▲ {hallucinationEvents.length} intercept{hallucinationEvents.length > 1 ? 's' : ''}
          </motion.div>
        )}

        {mcpToolCalls.length > 0 && (
          <div style={{
            background: 'rgba(212,175,55,0.06)',
            border: '1px solid rgba(212,175,55,0.2)',
            borderRadius: 2, padding: '3px 10px',
            fontSize: '0.62rem', color: 'var(--accent-gold)',
            fontWeight: 700, fontFamily: 'var(--font-mono)',
          }}>
            ◆ {mcpToolCalls.length} MCP call{mcpToolCalls.length > 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* ── Main 2-column layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 32, alignItems: 'start' }}>

        {/* ── LEFT: Rotating triangle & Tools ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
          <div style={{
            width: 320, height: 320,
            position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {/* Triangle frame lines */}
            <svg
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
              viewBox="-160 -160 320 320"
            >
              {[0, 1, 2].map(i => {
                const a = TRIANGLE_POSITIONS[i]
                const b = TRIANGLE_POSITIONS[(i + 1) % 3]
                return (
                  <line key={i}
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke="rgba(212,175,55,0.1)" strokeWidth="1" strokeDasharray="4 6"
                  />
                )
              })}
              <circle cx={0} cy={0} r={3} fill="rgba(212,175,55,0.25)" />
            </svg>

            {/* Rotating container — the whole triangle rotates */}
            <motion.div
              animate={{ rotate: rotationDeg }}
              transition={{ type: 'spring', stiffness: 120, damping: 18, mass: 1.2 }}
              style={{
                position: 'absolute',
                width: 0, height: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {PERSONAS.map((persona, slotIdx) => {
                const pos = TRIANGLE_POSITIONS[slotIdx]
                const isActive = currentSpeaker === persona
                const wasHallucinated = hallucinationEvents.some(e =>
                  e.speaker?.toLowerCase().includes(persona)
                )

                return (
                  <motion.div
                    key={persona}
                    style={{
                      position: 'absolute',
                      left: pos.x,
                      top: pos.y,
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    {/* Counter-rotate the label so text always reads upright */}
                    <motion.div
                      animate={{ rotate: -rotationDeg }}
                      transition={{ type: 'spring', stiffness: 120, damping: 18, mass: 1.2 }}
                    >
                      <AgentNode
                        persona={persona}
                        isActive={isActive}
                        hallucinated={wasHallucinated && isActive}
                      />
                    </motion.div>
                  </motion.div>
                )
              })}
            </motion.div>
          </div>

          {/* Auto-Scrolling MCP tool calls feed underneath agents */}
          <div style={{ marginTop: 20, width: '100%', maxWidth: 320 }}>
            <div style={{
              fontSize: '0.58rem', color: 'var(--text-muted)', fontWeight: 700,
              letterSpacing: '0.12em', marginBottom: 8, paddingLeft: 4,
              fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ color: 'var(--accent-gold)', opacity: 0.5 }}>◆</span>
              Real-Time MCP Terminal
            </div>
            <div
              ref={mcpRef}
              style={{
                height: 140, overflowY: 'auto', paddingRight: 6,
                display: 'flex', flexDirection: 'column', gap: 6,
                background: 'rgba(0,0,0,0.3)', borderRadius: 2, padding: '10px',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {mcpToolCalls.map((call, i) => (
                <motion.div key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ type: 'spring' }}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    background: 'rgba(212,175,55,0.04)',
                    border: '1px solid rgba(212,175,55,0.12)',
                    borderRadius: 2, padding: '8px 12px',
                  }}
                >
                  <span style={{
                    fontSize: '0.6rem', marginTop: 2, color: 'var(--accent-gold)', opacity: 0.6,
                  }}>⚡</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.68rem', color: 'var(--accent-gold)', fontWeight: 600
                    }}>
                      {call.tool}()
                    </div>
                    {call.detail && (
                      <div style={{
                        fontSize: '0.58rem', color: 'var(--text-muted)',
                        marginTop: 3, lineHeight: 1.45,
                        wordBreak: 'break-word', maxHeight: '3.6rem', overflow: 'hidden',
                        fontFamily: 'var(--font-mono)',
                      }}>
                        {call.detail}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
              {mcpToolCalls.length === 0 && (
                <div style={{
                  fontSize: '0.62rem', color: 'var(--text-muted)', textAlign: 'center',
                  marginTop: 30, fontFamily: 'var(--font-mono)', fontStyle: 'italic',
                }}>
                  Awaiting external tool triggers...
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Speech bubble + transcript window ── */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 16,
          height: '100%', maxHeight: 540,
          background: 'rgba(0,0,0,0.15)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 2,
          padding: 16,
        }}>
          {/* Active speaker bubble */}
          <SpeechBubble
            persona={currentSpeaker}
            text={activeSpeakerText}
            isStreaming={isStreaming && PERSONAS.includes(currentSpeaker)}
            hallucinated={isHallucinatedSpeaker}
          />

          {/* Scrollable full transcript history — chronological feed of all turns */}
          <div
            ref={scrollRef}
            style={{
              flex: 1, overflowY: 'auto',
              display: 'flex', flexDirection: 'column', gap: 10,
              paddingRight: 8,
            }}
          >
            {chatHistory.map((chat, idx) => {
              // Hide the very last message in the history ONLY if it belongs to the current speaker.
              // This is because the SpeechBubble above is already displaying it!
              if (idx === chatHistory.length - 1 && chat.speaker === currentSpeaker) return null;

              return (
                <div key={chat.id} style={{
                  background: 'rgba(255,255,255,0.015)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 2, padding: '14px 18px',
                }}>
                  <div style={{
                    fontSize: '0.62rem', color: 'var(--text-muted)', marginBottom: 8,
                    fontWeight: 700, letterSpacing: '0.08em',
                    fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
                  }}>
                    {chat.speaker.toUpperCase()}
                  </div>
                  <div className="markdown-wrapper" style={{
                    fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.65,
                  }}>
                    <ReactMarkdown>{chat.content}</ReactMarkdown>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Synthesis output section ── */}
      <AnimatePresence>
        {transcripts.synthesis && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 180, damping: 22 }}
            className="corner-marks"
            style={{
              marginTop: 28,
              background: 'linear-gradient(135deg, rgba(61,214,140,0.04), rgba(7,8,13,0.95))',
              border: '1px solid rgba(61,214,140,0.2)',
              borderRadius: 2, padding: 22,
            }}
          >
            <div style={{
              fontSize: '0.62rem', color: 'var(--accent-jade)', fontWeight: 700,
              letterSpacing: '0.12em', marginBottom: 12,
              fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ width: 12, height: 1, background: 'var(--accent-jade)', display: 'inline-block' }} />
              Synthesis Agent Analysis
            </div>
            <div style={{
              fontSize: '0.84rem', color: 'var(--text-secondary)',
              lineHeight: 1.7, whiteSpace: 'pre-wrap',
              fontFamily: 'var(--font-body)',
            }}>
              {transcripts.synthesis}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Live Stock Charts (broadcast by Synthesis Agent) ── */}
      {Object.keys(stockCharts).length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{
            fontSize: '0.58rem', color: 'var(--text-muted)', fontWeight: 700,
            letterSpacing: '0.12em', marginBottom: 14,
            fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ width: 12, height: 1, background: 'var(--accent-gold)', display: 'inline-block', opacity: 0.5 }} />
            Live Market Data — Synthesis Agent Intelligence
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
            {Object.entries(stockCharts).map(([ticker, chartInfo], idx) => (
              <StockChart
                key={ticker}
                ticker={ticker}
                data={chartInfo.data}
                currentPrice={chartInfo.currentPrice}
                changePct={chartInfo.changePct}
                mode={chartInfo.mode}
                colorIdx={idx}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Final signal ── */}
      <TradingSignal signal={finalSignal} causalChain={causalChain} />

      {/* ── GraphViz ── */}
      <GraphViz causalChain={causalChain} graphContext={graphContext} />
    </div>
  )
}
