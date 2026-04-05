import { useMemo } from 'react'
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import { motion } from 'framer-motion'

// ─── Refined color palette ────────────────────────────────────────────────────
const TICKER_COLORS = [
  '#d4af37', '#58c4dc', '#d65c6f', '#3dd68c', '#a89cdb', '#c9973b',
]

// ─── Custom tooltip ──────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0]?.payload || {}
  return (
    <div style={{
      background: 'rgba(7, 8, 13, 0.96)',
      border: '1px solid var(--border)',
      borderRadius: 2, padding: '10px 14px',
      fontSize: '0.72rem', color: 'var(--text-secondary)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      minWidth: 160,
      fontFamily: 'var(--font-mono)',
    }}>
      <div style={{
        fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6,
        fontFamily: 'var(--font-body)',
      }}>{label}</div>
      {d.close !== undefined && (
        <div>Close: <span style={{ color: 'var(--accent-gold)', fontWeight: 700 }}>₹{d.close?.toLocaleString('en-IN')}</span></div>
      )}
      {d.high !== undefined && (
        <div>High: <span style={{ color: 'var(--accent-jade)' }}>₹{d.high?.toLocaleString('en-IN')}</span></div>
      )}
      {d.low !== undefined && (
        <div>Low: <span style={{ color: 'var(--accent-crimson)' }}>₹{d.low?.toLocaleString('en-IN')}</span></div>
      )}
      {d.volume !== undefined && (
        <div>Volume: <span style={{ color: 'var(--accent-steel)' }}>{(d.volume / 1_000_000).toFixed(2)}M</span></div>
      )}
    </div>
  )
}

// ─── Mini trend badge ─────────────────────────────────────────────────────────
function TrendBadge({ changePct }) {
  if (changePct === undefined || changePct === null) return null
  const isUp = changePct >= 0
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      background: isUp ? 'rgba(61,214,140,0.08)' : 'rgba(229,56,79,0.08)',
      border: `1px solid ${isUp ? 'rgba(61,214,140,0.25)' : 'rgba(229,56,79,0.25)'}`,
      color: isUp ? 'var(--accent-jade)' : 'var(--accent-crimson)',
      borderRadius: 2, padding: '2px 8px',
      fontSize: '0.66rem', fontWeight: 700,
      fontFamily: 'var(--font-mono)',
    }}>
      {isUp ? '▲' : '▼'} {Math.abs(changePct).toFixed(2)}%
    </span>
  )
}

// ─── Main StockChart component ────────────────────────────────────────────────
export default function StockChart({ ticker, data, currentPrice, changePct, mode, colorIdx = 0 }) {
  const color = TICKER_COLORS[colorIdx % TICKER_COLORS.length]

  // Prepare chart data — short date labels
  const chartData = useMemo(() => {
    if (!data || !data.length) return []
    return data.map(d => ({
      ...d,
      dateLabel: d.date?.slice(5), // "08-15" format
    }))
  }, [data])

  if (!chartData.length) return null

  const prices = chartData.map(d => d.close).filter(Boolean)
  const minPrice = Math.min(...prices) * 0.998
  const maxPrice = Math.max(...prices) * 1.002

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 24 }}
      className="corner-marks"
      style={{
        background: 'rgba(0,0,0,0.2)',
        border: `1px solid ${color}22`,
        borderRadius: 2, padding: '16px 18px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          background: `${color}12`, border: `1px solid ${color}33`,
          borderRadius: 2, padding: '3px 10px',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.74rem', color, fontWeight: 700, letterSpacing: '0.08em',
        }}>
          {ticker}
        </div>
        {currentPrice && (
          <span style={{
            fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
          }}>
            ₹{currentPrice?.toLocaleString('en-IN')}
          </span>
        )}
        <TrendBadge changePct={changePct} />
        <span style={{
          marginLeft: 'auto', fontSize: '0.55rem',
          color: mode === 'live' ? 'var(--accent-jade)' : 'var(--text-muted)',
          fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
          fontFamily: 'var(--font-mono)',
        }}>
          {mode === 'live' ? '● LIVE' : '◎ SHOWDOWN'}
        </span>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.03)" />
          <XAxis
            dataKey="dateLabel"
            tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
            tickLine={false} axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[minPrice, maxPrice]}
            tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
            tickLine={false} axisLine={false}
            tickFormatter={v => `₹${(v / 1000).toFixed(1)}k`}
            width={48}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="volume" yAxisId={1} fill={`${color}12`} radius={[1, 1, 0, 0]} />
          <YAxis yAxisId={1} orientation="right" hide />
          <Line
            type="monotone"
            dataKey="close"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: color, stroke: 'transparent' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </motion.div>
  )
}
