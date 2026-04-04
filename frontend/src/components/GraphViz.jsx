import { motion } from 'framer-motion'

/**
 * GraphViz
 * SVG node-link diagram showing the causal chain from the GraphRAG + Synthesis.
 * Nodes appear one by one with staggered animation.
 */
export default function GraphViz({ causalChain = [], graphContext = {} }) {
  const allLinks = [
    ...(graphContext?.causal_chain || []),
    ...causalChain,
  ]

  // Deduplicate
  const seen = new Set()
  const links = allLinks.filter(l => {
    const key = `${l.source}|${l.relationship}|${l.target}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  if (!links.length) return null

  // Layout: arrange nodes in a rough horizontal flow
  const nodeMap = {}
  const nodes = []
  links.forEach(({ source, target }) => {
    [source, target].forEach(name => {
      if (!nodeMap[name]) {
        nodeMap[name] = nodes.length
        nodes.push(name)
      }
    })
  })

  const W = 700, H = 180
  const nodeRadius = 28
  const positions = nodes.map((_, i) => ({
    x: 60 + i * Math.floor((W - 120) / Math.max(nodes.length - 1, 1)),
    y: H / 2 + (i % 2 === 0 ? -30 : 30),
  }))

  const NODE_COLORS = ['#6366f1','#22d3ee','#f59e0b','#10b981','#f43f5e','#818cf8','#34d399']

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 12, fontWeight: 600, letterSpacing: '0.06em' }}>
        🔗 CAUSAL CHAIN — SUPPLY CHAIN IMPACT MAP
      </div>

      <div style={{
        background: 'rgba(13,17,23,0.8)',
        border: '1px solid var(--border)',
        borderRadius: 14, padding: 16,
        overflowX: 'auto',
      }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 400 }}>
          {/* Edges */}
          {links.map(({ source, target, relationship }, i) => {
            const s = positions[nodeMap[source]]
            const t = positions[nodeMap[target]]
            if (!s || !t) return null
            const mx = (s.x + t.x) / 2
            const my = (s.y + t.y) / 2 - 20
            return (
              <motion.g key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.12 }}>
                <defs>
                  <marker id={`arr-${i}`} viewBox="0 0 10 10" refX="10" refY="5"
                    markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(99,102,241,0.6)" />
                  </marker>
                </defs>
                <path
                  d={`M ${s.x} ${s.y} Q ${mx} ${my} ${t.x} ${t.y}`}
                  stroke="rgba(99,102,241,0.45)" strokeWidth="1.5"
                  fill="none" strokeDasharray="4 3"
                  markerEnd={`url(#arr-${i})`}
                />
                <text x={mx} y={my - 4} textAnchor="middle"
                  fill="rgba(148,163,184,0.8)" fontSize="9" fontFamily="JetBrains Mono, monospace">
                  {relationship}
                </text>
              </motion.g>
            )
          })}

          {/* Nodes */}
          {nodes.map((name, i) => {
            const pos = positions[i]
            const color = NODE_COLORS[i % NODE_COLORS.length]
            return (
              <motion.g key={name}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 + i * 0.08, type: 'spring', stiffness: 200, damping: 15 }}
                style={{ transformOrigin: `${pos.x}px ${pos.y}px` }}
              >
                <circle cx={pos.x} cy={pos.y} r={nodeRadius}
                  fill={`${color}18`} stroke={color} strokeWidth="1.5" />
                <text x={pos.x} y={pos.y + 4} textAnchor="middle"
                  fill={color} fontSize="9.5" fontWeight="700"
                  fontFamily="Inter, sans-serif">
                  {name.length > 10 ? name.slice(0, 9) + '…' : name}
                </text>
              </motion.g>
            )
          })}
        </svg>

        {/* Legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
          {links.map(({ source, relationship, target }, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.05 }}
              style={{
                fontSize: '0.68rem', color: 'var(--text-secondary)',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 6, padding: '3px 8px',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              {source} → <span style={{ color: '#818cf8' }}>{relationship}</span> → {target}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
