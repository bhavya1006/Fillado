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
        background: 'rgba(7,8,13,0.88)',
        backdropFilter: 'blur(24px) saturate(1.3)',
        borderBottom: '1px solid var(--border)',
        padding: '0 32px',
      }}>
        <div style={{
          maxWidth: 1280, margin: '0 auto',
          display: 'flex', alignItems: 'center', height: 64, gap: 24,
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginRight: 36 }}>
            <motion.div
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                width: 10, height: 10, borderRadius: '50%',
                background: 'var(--accent-gold)',
                boxShadow: '0 0 12px rgba(212,175,55,0.5)',
              }}
            />
            <div>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: '1.35rem',
                fontWeight: 400, letterSpacing: '-0.01em',
                color: 'var(--text-primary)',
              }}>
                Fillado
              </div>
              <div style={{
                fontSize: '0.52rem', color: 'var(--text-muted)', fontWeight: 600,
                letterSpacing: '0.14em', marginTop: -3,
                fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
              }}>
                Market Intelligence
              </div>
            </div>
            {/* Diagonal separator */}
            <div style={{
              width: 1, height: 28, background: 'var(--border)',
              transform: 'rotate(15deg)', marginLeft: 8,
            }} />
          </div>

          {/* Tabs */}
          <nav style={{ display: 'flex', gap: 2, position: 'relative' }}>
            {[
              { id: 'dashboard', label: 'Radar' },
              { id: 'trading-floor', label: 'Trading Floor', badge: isDebating ? 'LIVE' : null },
              { id: 'graph', label: 'Graph' },
            ].map(tab => (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: activeTab === tab.id
                    ? '2px solid var(--accent-gold)'
                    : '2px solid transparent',
                  padding: '8px 18px',
                  color: activeTab === tab.id ? 'var(--accent-gold)' : 'var(--text-muted)',
                  fontSize: '0.78rem', fontWeight: 600,
                  fontFamily: 'var(--font-body)',
                  cursor: 'pointer',
                  transition: 'all 0.25s',
                  display: 'flex', alignItems: 'center', gap: 8,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {tab.label}
                {tab.badge && (
                  <motion.span
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 0.9, repeat: Infinity }}
                    style={{
                      fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.08em',
                      background: 'rgba(61,214,140,0.12)',
                      border: '1px solid rgba(61,214,140,0.3)',
                      color: 'var(--accent-jade)',
                      borderRadius: 3, padding: '1px 5px',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {tab.badge}
                  </motion.span>
                )}
              </button>
            ))}
          </nav>

          {/* Right: History btn & badge */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              onClick={() => setIsHistoryOpen(true)}
              style={{
                background: 'rgba(212,175,55,0.06)',
                border: '1px solid rgba(212,175,55,0.18)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 14px',
                color: 'var(--accent-gold)',
                fontSize: '0.72rem', fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.2s',
                letterSpacing: '0.04em',
              }}
            >
              ◷ History
            </button>
            <div style={{
              fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.08em',
              color: 'var(--text-muted)',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 20, padding: '4px 12px',
              fontFamily: 'var(--font-mono)',
            }}>
              ET GenAI Hackathon
            </div>
          </div>
        </div>
      </header>

      {/* ── Slide-out History Panel ── */}
      <DebateHistory isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />

      {/* ── Hero section ── */}
      {activeTab === 'dashboard' && (
        <div style={{
          background: 'linear-gradient(180deg, rgba(212,175,55,0.04) 0%, transparent 100%)',
          borderBottom: '1px solid var(--border)',
          padding: '40px 32px 32px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Decorative diagonal line */}
          <div style={{
            position: 'absolute', top: 0, right: 120, width: 1, height: '140%',
            background: 'linear-gradient(to bottom, rgba(212,175,55,0.15), transparent)',
            transform: 'rotate(-15deg)', transformOrigin: 'top center',
          }} />
          <div style={{ maxWidth: 1280, margin: '0 auto', position: 'relative' }}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <div style={{
                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em',
                color: 'var(--accent-gold)', marginBottom: 12,
                fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{
                  width: 20, height: 1, background: 'var(--accent-gold)', display: 'inline-block'
                }} />
                VERNACULAR INTELLIGENCE PLATFORM
              </div>
              <h1 style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(2rem, 4.5vw, 3.4rem)', fontWeight: 400,
                fontStyle: 'italic',
                letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 16,
                color: 'var(--text-primary)',
              }}>
                Catch Market Signals<br />
                <span style={{ color: 'var(--accent-gold)' }}>Before English News Reacts</span>
              </h1>
              <p style={{
                fontSize: '0.92rem', color: 'var(--text-secondary)',
                maxWidth: 560, lineHeight: 1.7,
              }}>
                Fillado ingests vernacular disruption signals, debates them through a 
                multi-agent AI Trading Floor, and surfaces low-latency NSE alerts — 
                powered by LangGraph, Groq &amp; Neo4j.
              </p>
            </motion.div>

            {/* Quick stats */}
            <div style={{ display: 'flex', gap: 16, marginTop: 28, flexWrap: 'wrap' }}>
              {[
                { label: 'Agents', value: '3 + Synthesis', icon: '◆' },
                { label: 'LLM', value: 'Groq llama-3.3-70b', icon: '⚡' },
                { label: 'Graph', value: 'Neo4j AuraDB', icon: '◈' },
                { label: 'Latency', value: 'Real-Time WS', icon: '●' },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.08, duration: 0.5 }}
                  className="corner-marks"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border)',
                    borderRadius: 2, padding: '12px 18px',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}
                >
                  <span style={{
                    fontSize: '0.7rem', color: 'var(--accent-gold)', opacity: 0.7,
                  }}>{stat.icon}</span>
                  <div>
                    <div style={{
                      fontSize: '0.82rem', fontWeight: 700,
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-mono)',
                    }}>{stat.value}</div>
                    <div style={{
                      fontSize: '0.6rem', color: 'var(--text-muted)',
                      fontWeight: 600, letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                    }}>{stat.label}</div>
                  </div>
                </motion.div>
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
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
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
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Event banner */}
              {triggeredEvent && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-card-bright"
                  style={{
                    padding: '14px 20px', marginBottom: 24,
                    display: 'flex', alignItems: 'center', gap: 14,
                  }}
                >
                  <span style={{
                    width: 3, height: 32, background: 'var(--accent-gold)',
                    borderRadius: 2, flexShrink: 0,
                  }} />
                  <div>
                    <div style={{
                      fontSize: '0.65rem', color: 'var(--accent-gold)',
                      fontWeight: 700, letterSpacing: '0.1em',
                      fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
                    }}>
                      Active Event
                    </div>
                    <div style={{
                      fontSize: '0.88rem', color: 'var(--text-primary)',
                      fontWeight: 600, marginTop: 2,
                      fontFamily: 'var(--font-display)', fontStyle: 'italic',
                    }}>
                      {triggeredEvent.event}
                    </div>
                  </div>
                  {isDebating && (
                    <motion.div
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 0.9, repeat: Infinity }}
                      style={{
                        marginLeft: 'auto', fontSize: '0.65rem',
                        color: 'var(--accent-jade)', fontWeight: 700,
                        fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
                      }}>
                      ● DEBATE IN PROGRESS
                    </motion.div>
                  )}
                </motion.div>
              )}

              {!triggeredEvent ? (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  minHeight: 400, gap: 20, textAlign: 'center',
                }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    border: '2px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.2rem', color: 'var(--accent-gold)', opacity: 0.5,
                  }}>◎</div>
                  <div style={{
                    fontSize: '1.3rem', fontWeight: 400,
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-display)', fontStyle: 'italic',
                  }}>
                    Trading Floor Awaiting Signal
                  </div>
                  <div style={{
                    fontSize: '0.82rem', color: 'var(--text-muted)',
                    maxWidth: 420, lineHeight: 1.65,
                  }}>
                    Navigate to the Radar tab, select a vernacular event, 
                    and trigger an alert to initiate the AI debate.
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
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <GraphIntelligence />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '16px 32px',
        background: 'rgba(7,8,13,0.8)',
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{
          maxWidth: 1280, margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: '0.64rem', color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
        }}>
          <span>Fillado © 2024 — ET GenAI Hackathon. LangGraph · Groq · Neo4j AuraDB</span>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
            <span>GraphRAG</span>
            <span style={{ color: 'var(--border)', fontSize: '0.5rem' }}>◆</span>
            <span>Groq</span>
            <span style={{ color: 'var(--border)', fontSize: '0.5rem' }}>◆</span>
            <span>Neo4j</span>
            <span style={{ color: 'var(--border)', fontSize: '0.5rem' }}>◆</span>
            <span>MCP</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
