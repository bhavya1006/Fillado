import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'

export default function DebateHistory({ isOpen, onClose }) {
  const [debates, setDebates] = useState([])

  useEffect(() => {
    if (isOpen) {
      const stored = JSON.parse(localStorage.getItem('fillado_debates') || '[]')
      setDebates(stored)
    }
  }, [isOpen])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(7, 8, 13, 0.7)',
              backdropFilter: 'blur(6px)',
              zIndex: 100,
            }}
          />

          {/* Sidebar */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 200 }}
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, width: 400,
              background: 'var(--bg-card)',
              borderLeft: '1px solid var(--border)',
              zIndex: 101,
              display: 'flex', flexDirection: 'column',
              boxShadow: '-10px 0 50px rgba(0,0,0,0.6)',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '24px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <h2 style={{
                  fontFamily: 'var(--font-display)', fontSize: '1.2rem',
                  fontWeight: 400, fontStyle: 'italic',
                  margin: 0, color: 'var(--text-primary)',
                }}>Debate History</h2>
                <div style={{
                  fontSize: '0.58rem', color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
                  marginTop: 3, textTransform: 'uppercase',
                }}>
                  {debates.length} archived signal{debates.length !== 1 ? 's' : ''}
                </div>
              </div>
              <button 
                onClick={onClose}
                style={{ 
                  background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)', 
                  color: 'var(--text-muted)', width: 32, height: 32,
                  borderRadius: 2, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.9rem',
                }}
              >
                ✕
              </button>
            </div>

            {/* Debate list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {debates.length === 0 ? (
                <div style={{
                  textAlign: 'center', color: 'var(--text-muted)',
                  fontSize: '0.82rem', marginTop: 48,
                  fontFamily: 'var(--font-body)', fontStyle: 'italic',
                }}>
                  No debates archived yet. Trigger an event to begin.
                </div>
              ) : (
                debates.map((d, i) => (
                  <motion.div
                    key={d.id || i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="corner-marks"
                    style={{ 
                      background: 'rgba(255,255,255,0.015)', 
                      border: '1px solid var(--border-subtle)', 
                      borderRadius: 2, padding: 18,
                    }}
                  >
                    <div style={{
                      fontSize: '0.58rem', color: 'var(--text-muted)', marginBottom: 8,
                      fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
                    }}>
                      {new Date(d.timestamp).toLocaleString()}
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-display)', fontSize: '0.95rem',
                      fontWeight: 400, fontStyle: 'italic',
                      color: 'var(--accent-gold)', marginBottom: 12,
                    }}>
                      {d.event}
                    </div>

                    {d.signal?.CONSENSUS && (
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        <span style={{ 
                          fontSize: '0.62rem', padding: '2px 8px', borderRadius: 2,
                          fontWeight: 700, fontFamily: 'var(--font-mono)',
                          letterSpacing: '0.06em',
                          background: d.signal.CONSENSUS === 'BULLISH' ? 'rgba(61,214,140,0.1)' : 'rgba(229,56,79,0.1)',
                          color: d.signal.CONSENSUS === 'BULLISH' ? 'var(--accent-jade)' : 'var(--accent-crimson)',
                          border: `1px solid ${d.signal.CONSENSUS === 'BULLISH' ? 'rgba(61,214,140,0.25)' : 'rgba(229,56,79,0.25)'}`,
                        }}>
                          {d.signal.CONSENSUS}
                        </span>
                        <span style={{
                          fontSize: '0.62rem', padding: '2px 8px', borderRadius: 2,
                          background: 'rgba(212,175,55,0.06)',
                          border: '1px solid rgba(212,175,55,0.15)',
                          fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)',
                        }}>
                          {d.signal.PRIMARY_TICKER}
                        </span>
                      </div>
                    )}

                    <div style={{
                      fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.55,
                      fontFamily: 'var(--font-body)',
                    }}>
                      {d.signal?.RATIONALE || 'No synthesis rationale available.'}
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
