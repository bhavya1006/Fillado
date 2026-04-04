import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import './index.css'
import Dashboard from './components/Dashboard'
import TradingFloor from './components/TradingFloor'
import DebateHistory from './components/DebateHistory'
import GraphIntelligence from './components/GraphIntelligence'
import { useWebSocket } from './hooks/useWebSocket'

const TABS = ['dashboard', 'trading-floor', 'graph']

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [triggeredEvent, setTriggeredEvent] = useState(null)
  const [isDebating, setIsDebating] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)

  const { messages, lastMessage, status: wsStatus, clearMessages } = useWebSocket()

  const handleTriggerEvent = useCallback((data) => {
    clearMessages()
    setTriggeredEvent(data)
    setIsDebating(true)
    setActiveTab('trading-floor')
  }, [clearMessages])

  // Watch for debate end
  const latestMsg = messages[messages.length - 1]
  if (latestMsg?.type === 'debate_end' && isDebating) {
    setIsDebating(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* ── Nav bar ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(5,8,16,0.85)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border)',
        padding: '0 32px',
      }}>
        <div style={{
          maxWidth: 1280, margin: '0 auto',
          display: 'flex', alignItems: 'center', height: 60, gap: 20,
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 32 }}>
            <motion.div
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
              style={{ fontSize: '1.4rem' }}
            >
              ◈
            </motion.div>
            <div>
              <div className="gradient-text" style={{ fontSize: '1.15rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
                Fillado
              </div>
              <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.08em', marginTop: -2 }}>
                REALITY-ANCHORED MARKET INTELLIGENCE
              </div>
            </div>
          </div>

          {/* Tabs */}
          <nav style={{ display: 'flex', gap: 4 }}>
            {[
              { id: 'dashboard', label: '📡 Radar', },
              { id: 'trading-floor', label: '🎯 Trading Floor', badge: isDebating ? 'LIVE' : null },
              { id: 'graph', label: '🕸 Knowledge Graph' },
            ].map(tab => (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  background: activeTab === tab.id ? 'rgba(99,102,241,0.15)' : 'transparent',
                  border: activeTab === tab.id ? '1px solid rgba(99,102,241,0.4)' : '1px solid transparent',
                  borderRadius: 8, padding: '6px 16px',
                  color: activeTab === tab.id ? 'var(--accent-purple)' : 'var(--text-muted)',
                  fontSize: '0.8rem', fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                {tab.label}
                {tab.badge && (
                  <motion.span
                    animate={{ opacity: [1, 0.4, 1] }}
                    transition={{ duration: 0.9, repeat: Infinity }}
                    style={{
                      fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.06em',
                      background: 'rgba(34,211,238,0.15)',
                      border: '1px solid rgba(34,211,238,0.4)',
                      color: '#22d3ee',
                      borderRadius: 4, padding: '1px 5px',
                    }}
                  >
                    {tab.badge}
                  </motion.span>
                )}
              </button>
            ))}
          </nav>

          {/* Right: hackathon badge & History btn */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              onClick={() => setIsHistoryOpen(true)}
              style={{
                background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
                borderRadius: 8, padding: '6px 14px', color: '#818cf8',
                fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6
              }}
            >
              🕒 Debate History
            </button>
            <div style={{
              fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em',
              color: 'var(--text-muted)',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 20, padding: '4px 12px',
            }}>
              ET GenAI Hackathon — AI for the Indian Investor
            </div>
          </div>
        </div>
      </header>

      {/* ── Slide-out History Panel ── */}
      <DebateHistory isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />

      {/* ── Hero section ── */}
      {activeTab === 'dashboard' && (
        <div style={{
          background: 'linear-gradient(180deg, rgba(99,102,241,0.06) 0%, transparent 100%)',
          borderBottom: '1px solid var(--border)',
          padding: '32px 32px 28px',
        }}>
          <div style={{ maxWidth: 1280, margin: '0 auto' }}>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <h1 className="gradient-text" style={{
                fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 900,
                letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 12,
              }}>
                Catch Market Signals Before<br />English News Reacts
              </h1>
              <p style={{ fontSize: '1rem', color: 'var(--text-muted)', maxWidth: 600, lineHeight: 1.65 }}>
                Fillado ingests vernacular disruption signals, debates them through a multi-agent AI Trading Floor,
                and surfaces low-latency NSE alerts — powered by LangGraph + Groq + Neo4j.
              </p>
            </motion.div>

            {/* Quick stats */}
            <div style={{ display: 'flex', gap: 20, marginTop: 24, flexWrap: 'wrap' }}>
              {[
                { label: 'Agents', value: '3 + Synthesis', icon: '🤖' },
                { label: 'LLM', value: 'Groq llama-3.3-70b-versatile', icon: '⚡' },
                { label: 'Knowledge Graph', value: 'Neo4j AuraDB', icon: '🕸' },
                { label: 'Latency', value: 'Real-Time WS', icon: '📡' },
              ].map(stat => (
                <div key={stat.label} style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border)',
                  borderRadius: 10, padding: '10px 16px',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span style={{ fontSize: '1.1rem' }}>{stat.icon}</span>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>{stat.value}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <main style={{ flex: 1, padding: '32px 32px', maxWidth: 1280, margin: '0 auto', width: '100%' }}>
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.25 }}
            >
              <Dashboard
                onTriggerEvent={handleTriggerEvent}
                isDebating={isDebating}
                wsStatus={wsStatus}
              />
            </motion.div>
          )}

          {activeTab === 'trading-floor' && (
            <motion.div
              key="trading-floor"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              {/* Event banner */}
              {triggeredEvent && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-card-bright"
                  style={{ padding: '14px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 14 }}
                >
                  <span style={{ fontSize: '1.2rem' }}>🚨</span>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--accent-purple)', fontWeight: 700, letterSpacing: '0.06em' }}>
                      ACTIVE EVENT
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600, marginTop: 2 }}>
                      {triggeredEvent.event}
                    </div>
                  </div>
                  {isDebating && (
                    <motion.div
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 0.9, repeat: Infinity }}
                      style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#22d3ee', fontWeight: 700 }}>
                      ● DEBATE IN PROGRESS
                    </motion.div>
                  )}
                </motion.div>
              )}

              {!triggeredEvent ? (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  minHeight: 400, gap: 16, textAlign: 'center',
                }}>
                  <div style={{ fontSize: '3rem' }}>🎯</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Trading Floor Awaiting Signal
                  </div>
                  <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', maxWidth: 400, lineHeight: 1.6 }}>
                    Go to the Radar tab, select a vernacular event, and click "Simulate Vernacular Alert" to start the AI debate.
                  </div>
                  <button id="go-to-radar-btn" className="btn-primary" onClick={() => setActiveTab('dashboard')}>
                    → Go to Radar
                  </button>
                </div>
              ) : (
                <div className="glass-card" style={{ padding: 28 }}>
                  <TradingFloor
                    messages={messages}
                    lastMessage={lastMessage}
                    wsStatus={wsStatus}
                  />
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'graph' && (
            <motion.div
              key="graph"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25 }}
            >
              <GraphIntelligence />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '14px 32px',
        background: 'rgba(5,8,16,0.7)',
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{
          maxWidth: 1280, margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: '0.68rem', color: 'var(--text-muted)',
        }}>
          <span>Fillado © 2024 — ET GenAI Hackathon. Built with LangGraph + Groq + Neo4j AuraDB.</span>
          <div style={{ display: 'flex', gap: 16 }}>
            <span>🧠 GraphRAG</span>
            <span>⚡ Groq</span>
            <span>🕸 Neo4j</span>
            <span>🔌 MCP</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
