import { motion } from 'framer-motion'

const DIRECTION_MAP = { BULLISH: 1, BEARISH: -1, NEUTRAL: 0 }
const DIRECTION_COLOR = {
  BULLISH: '#10b981',
  BEARISH: '#f43f5e',
  NEUTRAL: '#f59e0b',
}

/**
 * TradingSignal
 * Final actionable output card from the Synthesis Agent.
 */
export default function TradingSignal({ signal = {}, causalChain = [] }) {
  if (!signal || Object.keys(signal).length === 0) return null

  const consensus    = signal.CONSENSUS || signal.consensus || 'NEUTRAL'
  const primaryTicker = signal.PRIMARY_TICKER || signal.primary_ticker || '—'
  const secondaries  = signal.SECONDARY_TICKERS || signal.secondary_tickers || []
  const timeHorizon  = signal.TIME_HORIZON || signal.time_horizon || '—'
  const confidence   = signal.confidence || '—'
  const rationale    = signal.RATIONALE || signal.rationale || signal.raw || '—'
  const color = DIRECTION_COLOR[consensus] || '#f59e0b'

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 22 }}
      style={{
        background: `linear-gradient(135deg, ${color}0d, rgba(13,17,23,0.95))`,
        border: `1.5px solid ${color}50`,
        borderRadius: 18,
        padding: 24,
        marginTop: 24,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.08em', marginBottom: 4 }}>
            🎯 SYNTHESIS AGENT — FINAL TRADING SIGNAL
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color }}>
            {consensus}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Confidence</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color }}>{confidence}</div>
        </div>
      </div>

      {/* Tickers row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: `${color}18`,
          border: `1.5px solid ${color}50`,
          borderRadius: 8, padding: '6px 14px',
        }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>PRIMARY</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '0.92rem', color }}>
            {primaryTicker}
          </span>
        </div>
        {[...(Array.isArray(secondaries) ? secondaries : [secondaries])].map((t, i) => (
          <span key={i} className="ticker-badge">{t}</span>
        ))}
      </div>

      {/* Metadata */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8, padding: '6px 14px',
          fontSize: '0.78rem', color: 'var(--text-secondary)',
        }}>
          ⏱ {timeHorizon}
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8, padding: '6px 14px',
          fontSize: '0.78rem', color: 'var(--text-secondary)',
        }}>
          🤖 LangGraph — 3 agents · 3 turns
        </div>
      </div>

      {/* Rationale */}
      {rationale && rationale !== '—' && (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10, padding: '12px 16px',
          fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.65,
        }}>
          <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.7rem', letterSpacing: '0.06em' }}>
            RATIONALE  
          </span>
          <br />
          {rationale}
        </div>
      )}

      {/* Graph learned marker */}
      {causalChain.length > 0 && (
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          style={{
            marginTop: 14,
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.3)',
            borderRadius: 8, padding: '8px 14px',
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: '0.75rem', color: '#10b981',
          }}
        >
          <span>🧠</span>
          <div>
            <strong>Fillado has learned {causalChain.length} new market connection{causalChain.length > 1 ? 's' : ''}!</strong>
            <br />
            <span style={{ color: 'rgba(16,185,129,0.7)', fontSize: '0.68rem' }}>
              Written to Neo4j AuraDB via append_causal_link()
            </span>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
