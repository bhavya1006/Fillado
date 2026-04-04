import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const MOCK_EVENTS = [
  {
    id: 'ev-001',
    title: '🚚 Transport Strike in Gujarat',
    description: 'Truck operators in Gujarat call indefinite bandh. Mundra port cargo movement halted.',
    severity: 'HIGH',
    tickers: ['ADANIPORTS', 'CONCOR', 'GUJGASLTD'],
    event_text: 'Transport Strike in Gujarat – Truck operators call indefinite bandh, Mundra port cargo movement halted',
  },
  {
    id: 'ev-002',
    title: '🏭 Hosur Factory Strike – Ashok Leyland',
    description: 'Workers at Ashok Leyland Hosur plant call strike over wage dispute.',
    severity: 'MEDIUM',
    tickers: ['ASHOKLEY', 'MRF', 'APOLLOTYRE'],
    event_text: 'Hosur factory workers strike at Ashok Leyland plant, production halted',
  },
  {
    id: 'ev-003',
    title: '🌀 Cyclone Warning – Andhra Pradesh Coast',
    description: 'IMD issues cyclone alert for AP coast. Fishing and port activity suspended.',
    severity: 'HIGH',
    tickers: ['HINDPETRO', 'KPITTECH', 'IRCTC'],
    event_text: 'Cyclone warning issued for Andhra Pradesh coast by IMD, port activities halt',
  },
]

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <span style={{ fontSize: '1.5rem' }}>📡</span>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Vernacular Radar
            </h2>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: 480, lineHeight: 1.6 }}>
            Regional market disruptions before mainstream English news reacts.
            Select an event to trigger the AI debate on the Trading Floor.
          </p>
        </div>

        {/* WS Status pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 24, padding: '6px 14px',
        }}>
          <span className={`status-dot ${wsStatus === 'connected' ? 'live' : wsStatus === 'error' ? 'error' : 'idle'}`} />
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {wsStatus === 'connected' ? 'WS Live' : wsStatus === 'connecting' ? 'Connecting…' : 'WS Offline'}
          </span>
        </div>
      </div>

      {/* ── Event cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {MOCK_EVENTS.map((ev) => {
          const isSelected = selectedEvent?.id === ev.id
          return (
            <motion.div
              key={ev.id}
              whileHover={{ y: -4, boxShadow: '0 12px 40px rgba(99,102,241,0.18)' }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelectedEvent(isSelected ? null : ev)}
              className="glass-card"
              style={{
                padding: 18, cursor: 'pointer',
                border: isSelected ? '1.5px solid var(--accent-indigo)' : '1px solid var(--border)',
                transition: 'border-color 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                  {ev.title}
                </div>
                <span className={`badge-severity-${ev.severity.toLowerCase()}`}
                  style={{ borderRadius: 6, padding: '2px 8px', fontSize: '0.62rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {ev.severity}
                </span>
              </div>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: 12 }}>
                {ev.description}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ev.tickers.map(t => <span key={t} className="ticker-badge">{t}</span>)}
              </div>

              {isSelected && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  style={{ marginTop: 14 }}
                >
                  <button
                    id={`trigger-btn-${ev.id}`}
                    className="btn-primary"
                    style={{ width: '100%', fontSize: '0.82rem' }}
                    disabled={loading || isDebating}
                    onClick={(e) => { e.stopPropagation(); handleTrigger(ev.event_text) }}
                  >
                    {loading ? '⏳ Triggering…' : '🚨 Simulate Vernacular Alert'}
                  </button>
                </motion.div>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* ── Custom event input ── */}
      <div className="glass-card" style={{ padding: 20 }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, letterSpacing: '0.04em' }}>
          OR ENTER CUSTOM VERNACULAR EVENT
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
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--border)',
              borderRadius: 10, padding: '11px 16px',
              color: 'var(--text-primary)', fontSize: '0.84rem',
              outline: 'none',
              fontFamily: 'Inter, sans-serif',
            }}
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
            style={{ marginTop: 10, fontSize: '0.76rem', color: 'var(--accent-rose)' }}
          >
            ⚠ {error}. Make sure the backend is running on port 8000.
          </motion.div>
        )}
      </div>
    </div>
  )
}
