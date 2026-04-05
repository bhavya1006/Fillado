import { motion } from 'framer-motion'

const DIRECTION_MAP = { BULLISH: 1, BEARISH: -1, NEUTRAL: 0 }
const DIRECTION_COLOR = {
  BULLISH: 'var(--accent-jade)',
  BEARISH: 'var(--accent-crimson)',
  NEUTRAL: 'var(--accent-gold)',
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
  const color = DIRECTION_COLOR[consensus] || 'var(--accent-gold)'

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 22 }}
      className="corner-marks"
      style={{
        background: 'rgba(0,0,0,0.2)',
        border: '1px solid var(--border)',
        borderRadius: 2,
        padding: 26,
        marginTop: 24,
        position: 'relative',
      }}
    >
      {/* Top decorative line */}
      <div style={{
        position: 'absolute', top: 0, left: 24, right: 24, height: 1,
        background: `linear-gradient(to right, transparent, ${color}, transparent)`,
        opacity: 0.4,
      }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
        <div>
          <div style={{
            fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 700,
            letterSpacing: '0.12em', marginBottom: 6,
            fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
          }}>
            Synthesis Agent — Final Signal
          </div>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: '1.8rem',
            fontWeight: 400, fontStyle: 'italic', color,
          }}>
            {consensus}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{
            fontSize: '0.6rem', color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>Confidence</div>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: '1.3rem',
            fontWeight: 400, fontStyle: 'italic', color,
          }}>{confidence}</div>
        </div>
      </div>

      {/* Tickers row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(212,175,55,0.06)',
          border: '1px solid rgba(212,175,55,0.2)',
          borderRadius: 2, padding: '6px 14px',
        }}>
          <span style={{
            fontSize: '0.6rem', color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
          }}>PRIMARY</span>
          <span style={{
            fontFamily: 'var(--font-mono)', fontWeight: 700,
            fontSize: '0.88rem', color: 'var(--accent-gold)',
          }}>
            {primaryTicker}
          </span>
        </div>
        {[...(Array.isArray(secondaries) ? secondaries : [secondaries])].map((t, i) => (
          <span key={i} className="ticker-badge">{t}</span>
        ))}
      </div>

      {/* Metadata */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 2, padding: '6px 14px',
          fontSize: '0.74rem', color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)',
        }}>
          ⏱ {timeHorizon}
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 2, padding: '6px 14px',
          fontSize: '0.74rem', color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)',
        }}>
          LangGraph — 3 agents · 3 turns
        </div>
      </div>

      {/* Rationale */}
      {rationale && rationale !== '—' && (
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 2, padding: '14px 18px',
          fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.7,
        }}>
          <span style={{
            color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.6rem',
            letterSpacing: '0.1em', fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase',
          }}>
            Rationale  
          </span>
          <br />
          <span style={{ fontFamily: 'var(--font-body)' }}>{rationale}</span>
        </div>
      )}

      {/* Graph learned marker */}
      {causalChain.length > 0 && (
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          style={{
            marginTop: 16,
            background: 'rgba(61,214,140,0.05)',
            border: '1px solid rgba(61,214,140,0.2)',
            borderRadius: 2, padding: '10px 14px',
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: '0.74rem', color: 'var(--accent-jade)',
          }}
        >
          <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>◈</span>
          <div>
            <strong style={{ fontFamily: 'var(--font-body)' }}>
              Fillado has learned {causalChain.length} new market connection{causalChain.length > 1 ? 's' : ''}!
            </strong>
            <br />
            <span style={{
              color: 'rgba(61,214,140,0.6)', fontSize: '0.65rem',
              fontFamily: 'var(--font-mono)',
            }}>
              Written to Neo4j AuraDB via append_causal_link()
            </span>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
