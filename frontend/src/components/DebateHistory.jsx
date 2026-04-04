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
              background: 'rgba(5, 8, 16, 0.6)',
              backdropFilter: 'blur(4px)',
              zIndex: 100,
            }}
          />

          {/* Sidebar */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, width: 400,
              background: 'var(--bg-card)',
              borderLeft: '1px solid var(--border)',
              zIndex: 101,
              display: 'flex', flexDirection: 'column',
              boxShadow: '-10px 0 40px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: '1.2rem', margin: 0, color: 'var(--text-primary)' }}>Debate History</h2>
              <button 
                onClick={onClose}
                style={{ 
                  background: 'rgba(255,255,255,0.05)', border: 'none', 
                  color: 'var(--text-muted)', width: 32, height: 32, borderRadius: 8, cursor: 'pointer' 
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {debates.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 40 }}>
                  No debates found. Trigger an event to start!
                </div>
              ) : (
                debates.map((d, i) => (
                  <div key={d.id || i} style={{ 
                    background: 'rgba(255,255,255,0.02)', 
                    border: '1px solid rgba(255,255,255,0.06)', 
                    borderRadius: 12, padding: 16 
                  }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                      {new Date(d.timestamp).toLocaleString()}
                    </div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--accent-purple)', marginBottom: 12 }}>
                      {d.event}
                    </div>

                    {d.signal?.CONSENSUS && (
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        <span style={{ 
                          fontSize: '0.7rem', padding: '2px 8px', borderRadius: 4, fontWeight: 700,
                          background: d.signal.CONSENSUS === 'BULLISH' ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)',
                          color: d.signal.CONSENSUS === 'BULLISH' ? '#10b981' : '#f43f5e'
                        }}>
                          {d.signal.CONSENSUS}
                        </span>
                        <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.05)' }}>
                          {d.signal.PRIMARY_TICKER}
                        </span>
                      </div>
                    )}

                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {d.signal?.RATIONALE || 'No synthesis rationale available.'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
