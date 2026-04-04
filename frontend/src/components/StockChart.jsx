import { useMemo } from 'react'
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import { motion } from 'framer-motion'

// ─── Persona colour map ──────────────────────────────────────────────────────
const TICKER_COLORS = [
  '#22d3ee', '#818cf8', '#f43f5e', '#10b981', '#f59e0b', '#a78bfa',
]

// ─── Custom tooltip ──────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0]?.payload || {}
  return (
    <div style={{
      background: 'rgba(13, 17, 23, 0.96)',
      border: '1px solid rgba(99,102,241,0.3)',
      borderRadius: 10, padding: '10px 14px',
      fontSize: '0.75rem', color: 'var(--text-secondary)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      minWidth: 160,
    }}>
      <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{label}</div>
      {d.close !== undefined && (
        <div>Close: <span style={{ color: '#22d3ee', fontWeight: 700 }}>₹{d.close?.toLocaleString('en-IN')}</span></div>
      )}
      {d.high !== undefined && (
        <div>High: <span style={{ color: '#10b981' }}>₹{d.high?.toLocaleString('en-IN')}</span></div>
      )}
      {d.low !== undefined && (
        <div>Low: <span style={{ color: '#f43f5e' }}>₹{d.low?.toLocaleString('en-IN')}</span></div>
      )}
      {d.volume !== undefined && (
        <div>Volume: <span style={{ color: '#818cf8' }}>{(d.volume / 1_000_000).toFixed(2)}M</span></div>
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
      background: isUp ? 'rgba(16,185,129,0.12)' : 'rgba(244,63,94,0.12)',
      border: `1px solid ${isUp ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)'}`,
      color: isUp ? '#10b981' : '#f43f5e',
      borderRadius: 6, padding: '2px 8px',
      fontSize: '0.7rem', fontWeight: 700,
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
      style={{
        background: 'rgba(255,255,255,0.018)',
        border: `1px solid ${color}44`,
        borderRadius: 14, padding: '16px 18px',
        boxShadow: `0 0 24px ${color}1a`,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          background: `${color}22`, border: `1px solid ${color}55`,
          borderRadius: 6, padding: '3px 10px',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.78rem', color, fontWeight: 700, letterSpacing: '0.06em',
        }}>
          {ticker}
        </div>
        {currentPrice && (
          <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            ₹{currentPrice?.toLocaleString('en-IN')}
          </span>
        )}
        <TrendBadge changePct={changePct} />
        <span style={{
          marginLeft: 'auto', fontSize: '0.6rem',
          color: mode === 'live' ? '#10b981' : 'var(--text-muted)',
          fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          {mode === 'live' ? '● LIVE' : '◎ SHOWDOWN'}
        </span>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="dateLabel"
            tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
            tickLine={false} axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[minPrice, maxPrice]}
            tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
            tickLine={false} axisLine={false}
            tickFormatter={v => `₹${(v / 1000).toFixed(1)}k`}
            width={48}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="volume" yAxisId={1} fill={`${color}18`} radius={[2, 2, 0, 0]} />
          <YAxis yAxisId={1} orientation="right" hide />
          <Line
            type="monotone"
            dataKey="close"
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: color, stroke: 'transparent' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </motion.div>
  )
}
