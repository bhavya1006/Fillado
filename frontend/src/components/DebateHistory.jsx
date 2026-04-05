import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useRef } from 'react'

const API_BASE = 'http://localhost:8000'

// ── Inline audio player component ──────────────────────────────────────────
function AnchorPlayer({ debate, onGenerate }) {
  const audioRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
    } else {
      audio.play()
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      {/* Anchor script preview */}
      {debate.anchorScript && (
        <div style={{
          fontSize: '0.73rem', color: 'var(--text-secondary)', lineHeight: 1.6,
          fontFamily: 'var(--font-body)', fontStyle: 'italic',
          background: 'rgba(212,175,55,0.04)',
          border: '1px solid rgba(212,175,55,0.12)',
          borderRadius: 2, padding: '10px 14px', marginBottom: 10,
        }}>
          <div style={{
            fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.1em',
            color: 'var(--accent-gold)', marginBottom: 6,
            fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
          }}>
            🎙 AI Anchor Script
          </div>
          {debate.anchorScript}
        </div>
      )}

      {/* Audio controls */}
      {debate.audioUrl && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(61,214,140,0.04)',
          border: '1px solid rgba(61,214,140,0.15)',
          borderRadius: 2, padding: '8px 12px',
        }}>
          <button
            onClick={togglePlay}
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: isPlaying ? 'rgba(61,214,140,0.15)' : 'rgba(61,214,140,0.1)',
              border: '1px solid rgba(61,214,140,0.3)',
              color: 'var(--accent-jade)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.7rem', flexShrink: 0,
              transition: 'all 0.2s',
            }}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <audio
            ref={audioRef}
            src={`${API_BASE}${debate.audioUrl}`}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            style={{ flex: 1, height: 28, accentColor: 'var(--accent-jade)' }}
            controls
          />
        </div>
      )}

      {/* Generate button — shown only if no audio yet */}
      {!debate.audioUrl && (
        <button
          onClick={() => onGenerate(debate)}
          disabled={debate._voiceLoading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: debate._voiceLoading
              ? 'rgba(255,255,255,0.02)'
              : 'rgba(212,175,55,0.06)',
            border: `1px solid ${debate._voiceLoading
              ? 'var(--border-subtle)'
              : 'rgba(212,175,55,0.2)'}`,
            borderRadius: 2, padding: '5px 12px',
            color: debate._voiceLoading ? 'var(--text-muted)' : 'var(--accent-gold)',
            fontSize: '0.65rem', fontWeight: 700,
            fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
            cursor: debate._voiceLoading ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            width: '100%', justifyContent: 'center',
          }}
        >
          {debate._voiceLoading ? (
            <>
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                style={{ display: 'inline-block' }}
              >⟳</motion.span>
              Generating anchor voice…
            </>
          ) : (
            <>🎙 Generate AI Anchor Voice</>
          )}
        </button>
      )}

      {/* Error state */}
      {debate._voiceError && (
        <div style={{
          fontSize: '0.62rem', color: 'var(--accent-crimson)',
          fontFamily: 'var(--font-mono)', marginTop: 6,
          padding: '4px 8px',
          background: 'rgba(229,56,79,0.06)',
          border: '1px solid rgba(229,56,79,0.2)',
          borderRadius: 2,
        }}>
          ▲ {debate._voiceError}
        </div>
      )}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────
export default function DebateHistory({ isOpen, onClose }) {
  const [debates, setDebates] = useState([])

  useEffect(() => {
    if (isOpen) {
      const stored = JSON.parse(localStorage.getItem('fillado_debates') || '[]')
      setDebates(stored)
    }
  }, [isOpen])

  // ── Persist any audioUrl / anchorScript back to localStorage ──
  const persistDebates = (updated) => {
    // Persist only the fields we want (strip transient loading/error flags)
    const clean = updated.map(({ _voiceLoading, _voiceError, ...d }) => d)
    localStorage.setItem('fillado_debates', JSON.stringify(clean))
    setDebates(updated)
  }

  // ── Generate voice for a single debate item ──
  const handleGenerate = async (debate) => {
    // Mark as loading
    setDebates(prev =>
      prev.map(d => d.id === debate.id
        ? { ...d, _voiceLoading: true, _voiceError: null }
        : d
      )
    )

    try {
      const rationale = debate.signal?.RATIONALE || 'Market analysis unavailable.'
      const event = debate.event || 'Market Event'

      const res = await fetch(`${API_BASE}/api/generate-voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          debate_id: String(debate.id),
          event,
          rationale,
        }),
      })

      const data = await res.json()

      if (data.error && !data.audio_url) {
        setDebates(prev =>
          prev.map(d => d.id === debate.id
            ? { ...d, _voiceLoading: false, _voiceError: data.error }
            : d
          )
        )
        return
      }

      // Success — persist audioUrl and anchorScript
      const updated = debates.map(d =>
        d.id === debate.id
          ? { ...d, audioUrl: data.audio_url, anchorScript: data.script, _voiceLoading: false, _voiceError: null }
          : d
      )
      persistDebates(updated)
    } catch (err) {
      setDebates(prev =>
        prev.map(d => d.id === debate.id
          ? { ...d, _voiceLoading: false, _voiceError: 'Network error — is the backend running?' }
          : d
        )
      )
    }
  }

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
              position: 'fixed', top: 0, right: 0, bottom: 0, width: 420,
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
            <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                    {/* Timestamp */}
                    <div style={{
                      fontSize: '0.58rem', color: 'var(--text-muted)', marginBottom: 8,
                      fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
                    }}>
                      {new Date(d.timestamp).toLocaleString()}
                    </div>

                    {/* Event title */}
                    <div style={{
                      fontFamily: 'var(--font-display)', fontSize: '0.95rem',
                      fontWeight: 400, fontStyle: 'italic',
                      color: 'var(--accent-gold)', marginBottom: 12,
                    }}>
                      {d.event}
                    </div>

                    {/* Consensus badge */}
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

                    {/* Rationale text */}
                    <div style={{
                      fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.55,
                      fontFamily: 'var(--font-body)', marginBottom: 14,
                    }}>
                      {d.signal?.RATIONALE || 'No synthesis rationale available.'}
                    </div>

                    {/* AI Anchor voice section */}
                    <AnchorPlayer debate={d} onGenerate={handleGenerate} />
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
