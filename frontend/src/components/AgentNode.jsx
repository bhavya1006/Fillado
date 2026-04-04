import { motion } from 'framer-motion'

const PERSONA_CONFIG = {
  retail: {
    name: 'Ravi',
    role: 'Retail Trader',
    emoji: '📈',
    color: '#22d3ee',
    glowClass: 'retail-glow',
    bg: 'rgba(34,211,238,0.1)',
    border: 'rgba(34,211,238,0.35)',
    initials: 'RT',
  },
  whale: {
    name: 'The Whale',
    role: 'Institutional',
    emoji: '🐋',
    color: '#818cf8',
    glowClass: 'whale-glow',
    bg: 'rgba(129,140,248,0.1)',
    border: 'rgba(129,140,248,0.35)',
    initials: 'W',
  },
  contrarian: {
    name: 'Vikram',
    role: 'Contrarian',
    emoji: '🔻',
    color: '#f43f5e',
    glowClass: 'contrarian-glow',
    bg: 'rgba(244,63,94,0.1)',
    border: 'rgba(244,63,94,0.35)',
    initials: 'C',
  },
  synthesis: {
    name: 'Synthesis',
    role: 'AI Arbiter',
    emoji: '🧠',
    color: '#10b981',
    glowClass: 'synthesis-glow',
    bg: 'rgba(16,185,129,0.1)',
    border: 'rgba(16,185,129,0.35)',
    initials: 'S',
  },
}

/**
 * AgentNode
 * Circular PFP node for a debate persona.
 * isActive = currently speaking → applies glow + scale.
 */
export default function AgentNode({ persona, isActive, hallucinated = false }) {
  const cfg = PERSONA_CONFIG[persona] || PERSONA_CONFIG.retail

  return (
    <motion.div
      layout
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
    >
      {/* Outer ring (pulse when active) */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Wavy Ripple Animation (Active Speaker) */}
        {isActive && [0, 1, 2].map((i) => (
          <motion.div
            key={i}
            initial={{ scale: 0.8, opacity: 0.6 }}
            animate={{ scale: 1.6, opacity: 0 }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.6,
              ease: "easeOut"
            }}
            style={{
              position: 'absolute',
              width: 84, height: 84,
              borderRadius: '50%',
              border: `1.5px solid ${cfg.color}`,
              pointerEvents: 'none',
              zIndex: -1,
            }}
          />
        ))}

        {/* Avatar circle */}
        <motion.div
          animate={isActive ? { scale: 1.12 } : { scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className={isActive ? cfg.glowClass : ''}
          style={{
            width: 72, height: 72,
            borderRadius: '50%',
            background: `radial-gradient(circle at 35% 35%, ${cfg.color}33, ${cfg.bg})`,
            border: `2.5px solid ${isActive ? cfg.color : cfg.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.6rem',
            cursor: 'default',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {cfg.emoji}

          {/* Hallucination flash overlay */}
          {hallucinated && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.7, 0, 0.7, 0] }}
              transition={{ duration: 1, times: [0, 0.2, 0.4, 0.6, 1] }}
              style={{
                position: 'absolute', inset: 0,
                background: 'rgba(244,63,94,0.45)',
                borderRadius: '50%',
              }}
            />
          )}
        </motion.div>

        {/* Active speaker indicator dot */}
        {isActive && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            style={{
              position: 'absolute',
              bottom: 2, right: 2,
              width: 14, height: 14,
              borderRadius: '50%',
              background: cfg.color,
              border: '2px solid #050810',
              boxShadow: `0 0 8px ${cfg.color}`,
            }}
          />
        )}
      </div>

      {/* Name + role */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: '0.82rem', fontWeight: 700,
          color: isActive ? cfg.color : 'var(--text-primary)',
          transition: 'color 0.3s',
        }}>
          {cfg.name}
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 1 }}>
          {cfg.role}
        </div>
      </div>
    </motion.div>
  )
}

export { PERSONA_CONFIG }
