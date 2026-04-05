import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const MOCK_EVENTS = [
  {
    id: 'ev-001',
    title: 'Transport Strike in Gujarat',
    description: 'Truck operators in Gujarat call indefinite bandh. Mundra port cargo movement halted.',
    severity: 'HIGH',
    tickers: ['ADANIPORTS', 'CONCOR', 'GUJGASLTD'],
    event_text: 'Transport Strike in Gujarat – Truck operators call indefinite bandh, Mundra port cargo movement halted',
  },
  {
    id: 'ev-002',
    title: 'Hosur Factory Strike — Ashok Leyland',
    description: 'Workers at Ashok Leyland Hosur plant call strike over wage dispute.',
    severity: 'MEDIUM',
    tickers: ['ASHOKLEY', 'MRF', 'APOLLOTYRE'],
    event_text: 'Hosur factory workers strike at Ashok Leyland plant, production halted',
  },
  {
    id: 'ev-003',
    title: 'Cyclone Warning — Andhra Pradesh Coast',
    description: 'IMD issues cyclone alert for AP coast. Fishing and port activity suspended.',
    severity: 'HIGH',
    tickers: ['HINDPETRO', 'KPITTECH', 'IRCTC'],
    event_text: 'Cyclone warning issued for Andhra Pradesh coast by IMD, port activities halt',
  },
]

const SEVERITY_ICONS = { HIGH: '▲', MEDIUM: '◆', LOW: '●' }

export default function Dashboard({ onTriggerEvent, isDebating, wsStatus }) {
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [customEvent, setCustomEvent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleTrigger = useCallback(async (eventText) => {
    if (!eventText.trim() || loading) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/trigger-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: eventText, simulate_hallucination: true }),
      })
      if (!res.ok) throw new Error(`Backend error ${res.status}`)
      const data = await res.json()
      onTriggerEvent?.(data)
    } catch (err) {
      setError(`Failed to trigger event: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [loading, onTriggerEvent])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{
              fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em',
              color: 'var(--accent-gold)', fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{
                width: 16, height: 1, background: 'var(--accent-gold)',
                display: 'inline-block',
              }} />
              Vernacular Radar
            </div>
          </div>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: '1.5rem',
            fontWeight: 400, fontStyle: 'italic',
            color: 'var(--text-primary)', marginBottom: 6,
          }}>
            Regional Disruption Feed
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: 480, lineHeight: 1.65 }}>
            Market disruptions detected from vernacular sources before mainstream English news reacts.
            Select an event to trigger the AI debate.
          </p>
        </div>

        {/* WS Status pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 20, padding: '6px 14px',
        }}>
          <span className={`status-dot ${wsStatus === 'connected' ? 'live' : wsStatus === 'error' ? 'error' : 'idle'}`} />
          <span style={{
            fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.06em',
            fontFamily: 'var(--font-mono)',
          }}>
            {wsStatus === 'connected' ? 'WS Live' : wsStatus === 'connecting' ? 'Connecting…' : 'WS Offline'}
          </span>
        </div>
      </div>

      {/* ── Event cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {MOCK_EVENTS.map((ev, evIdx) => {
          const isSelected = selectedEvent?.id === ev.id
          return (
            <motion.div
              key={ev.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: evIdx * 0.06, duration: 0.4 }}
              whileHover={{ y: -3, boxShadow: '0 8px 32px rgba(212,175,55,0.08)' }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelectedEvent(isSelected ? null : ev)}
              className="glass-card corner-marks"
              style={{
                padding: 20, cursor: 'pointer',
                border: isSelected ? '1px solid var(--border-bright)' : '1px solid var(--border)',
                borderRadius: 2,
                transition: 'border-color 0.3s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: '0.95rem',
                  fontWeight: 400, fontStyle: 'italic',
                  color: 'var(--text-primary)', lineHeight: 1.4,
                }}>
                  {ev.title}
                </div>
                <span className={`badge-severity-${ev.severity.toLowerCase()}`}
                  style={{
                    borderRadius: 2, padding: '2px 8px',
                    fontSize: '0.58rem', fontWeight: 700, whiteSpace: 'nowrap',
                    fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                  {SEVERITY_ICONS[ev.severity]} {ev.severity}
                </span>
              </div>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 14 }}>
                {ev.description}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ev.tickers.map(t => <span key={t} className="ticker-badge">{t}</span>)}
              </div>

              {isSelected && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  style={{ marginTop: 16 }}
                >
                  <button
                    id={`trigger-btn-${ev.id}`}
                    className="btn-primary"
                    style={{ width: '100%', fontSize: '0.78rem' }}
                    disabled={loading || isDebating}
                    onClick={(e) => { e.stopPropagation(); handleTrigger(ev.event_text) }}
                  >
                    {loading ? '⏳ Triggering…' : '→ Simulate Vernacular Alert'}
                  </button>
                </motion.div>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* ── Custom event input ── */}
      <div className="glass-card" style={{ padding: 22, borderRadius: 2 }}>
        <div style={{
          fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)',
          marginBottom: 14, letterSpacing: '0.12em',
          fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
        }}>
          Custom Vernacular Event
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            id="custom-event-input"
            type="text"
            value={customEvent}
            onChange={e => setCustomEvent(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleTrigger(customEvent)}
            placeholder="e.g. मुंबई बंदरगाह पर मजदूर हड़ताल (Mumbai port worker strike)…"
            style={{
              flex: 1,
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid var(--border)',
              borderRadius: 2, padding: '12px 16px',
              color: 'var(--text-primary)', fontSize: '0.84rem',
              outline: 'none',
              fontFamily: 'var(--font-body)',
              transition: 'border-color 0.2s',
            }}
            onFocus={e => e.target.style.borderColor = 'rgba(212,175,55,0.4)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
          <button
            id="custom-trigger-btn"
            className="btn-primary"
            disabled={loading || isDebating || !customEvent.trim()}
            onClick={() => handleTrigger(customEvent)}
          >
            {loading ? '⏳' : '→ Trigger'}
          </button>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              marginTop: 12, fontSize: '0.76rem', color: 'var(--accent-crimson)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{ fontSize: '0.6rem' }}>▲</span> {error}. Make sure the backend is running on port 8000.
          </motion.div>
        )}
      </div>
    </div>
  )
}
