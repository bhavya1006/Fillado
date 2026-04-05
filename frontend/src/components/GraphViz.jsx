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

  const NODE_COLORS = ['#d4af37', '#58c4dc', '#c9973b', '#3dd68c', '#d65c6f', '#a89cdb', '#7b93b0']

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{
        fontSize: '0.58rem', color: 'var(--text-muted)', marginBottom: 14,
        fontWeight: 700, letterSpacing: '0.12em',
        fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ width: 12, height: 1, background: 'var(--accent-gold)', display: 'inline-block', opacity: 0.5 }} />
        Causal Chain — Supply Chain Impact Map
      </div>

      <div className="corner-marks" style={{
        background: 'rgba(0,0,0,0.2)',
        border: '1px solid var(--border)',
        borderRadius: 2, padding: 18,
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
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(212,175,55,0.45)" />
                  </marker>
                </defs>
                <path
                  d={`M ${s.x} ${s.y} Q ${mx} ${my} ${t.x} ${t.y}`}
                  stroke="rgba(212,175,55,0.25)" strokeWidth="1.5"
                  fill="none" strokeDasharray="4 3"
                  markerEnd={`url(#arr-${i})`}
                />
                <text x={mx} y={my - 4} textAnchor="middle"
                  fill="rgba(154,147,135,0.8)" fontSize="9" fontFamily="'IBM Plex Mono', monospace">
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
                {/* Hexagonal node via polygon instead of circle */}
                <polygon
                  points={(() => {
                    const r = nodeRadius
                    return [0, 1, 2, 3, 4, 5].map(k => {
                      const angle = (Math.PI / 3) * k - Math.PI / 6
                      return `${pos.x + r * Math.cos(angle)},${pos.y + r * Math.sin(angle)}`
                    }).join(' ')
                  })()}
                  fill={`${color}12`} stroke={color} strokeWidth="1"
                />
                <text x={pos.x} y={pos.y + 4} textAnchor="middle"
                  fill={color} fontSize="9" fontWeight="700"
                  fontFamily="'DM Sans', sans-serif">
                  {name.length > 10 ? name.slice(0, 9) + '…' : name}
                </text>
              </motion.g>
            )
          })}
        </svg>

        {/* Legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          {links.map(({ source, relationship, target }, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.05 }}
              style={{
                fontSize: '0.64rem', color: 'var(--text-secondary)',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 2, padding: '3px 8px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {source} → <span style={{ color: 'var(--accent-gold)' }}>{relationship}</span> → {target}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
