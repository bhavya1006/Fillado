import { motion } from 'framer-motion'

const PERSONA_CONFIG = {
  retail: {
    name: 'Ravi',
    role: 'Retail Trader',
    emoji: '📈',
    color: '#58c4dc',
    glowClass: 'retail-glow',
    bg: 'rgba(88,196,220,0.08)',
    border: 'rgba(88,196,220,0.25)',
    initials: 'RT',
  },
  whale: {
    name: 'The Whale',
    role: 'Institutional',
    emoji: '🐋',
    color: '#a89cdb',
    glowClass: 'whale-glow',
    bg: 'rgba(168,156,219,0.08)',
    border: 'rgba(168,156,219,0.25)',
    initials: 'W',
  },
  contrarian: {
    name: 'Vikram',
    role: 'Contrarian',
    emoji: '🔻',
    color: '#d65c6f',
    glowClass: 'contrarian-glow',
    bg: 'rgba(214,92,111,0.08)',
    border: 'rgba(214,92,111,0.25)',
    initials: 'C',
  },
  synthesis: {
    name: 'Synthesis',
    role: 'AI Arbiter',
    emoji: '🧠',
    color: '#3dd68c',
    glowClass: 'synthesis-glow',
    bg: 'rgba(61,214,140,0.08)',
    border: 'rgba(61,214,140,0.25)',
    initials: 'S',
  },
}

/**
 * AgentNode
 * Hexagonal PFP node for a debate persona.
 * isActive = currently speaking → applies glow + scale.
 */
export default function AgentNode({ persona, isActive, hallucinated = false }) {
  const cfg = PERSONA_CONFIG[persona] || PERSONA_CONFIG.retail

  // Hexagonal clip path
  const hexClip = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)'

  return (
    <motion.div
      layout
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
    >
      {/* Outer ring (pulse when active) */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Ripple Animation (Active Speaker) — restrained */}
        {isActive && [0, 1].map((i) => (
          <motion.div
            key={i}
            initial={{ scale: 0.85, opacity: 0.4 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              delay: i * 0.8,
              ease: "easeOut"
            }}
            style={{
              position: 'absolute',
              width: 82, height: 82,
              clipPath: hexClip,
              border: `1px solid ${cfg.color}`,
              background: `${cfg.color}08`,
              pointerEvents: 'none',
              zIndex: -1,
            }}
          />
        ))}

        {/* Avatar — hexagonal */}
        <motion.div
          animate={isActive ? { scale: 1.08 } : { scale: 1 }}
          transition={{ type: 'spring', stiffness: 280, damping: 22 }}
          className={isActive ? cfg.glowClass : ''}
          style={{
            width: 72, height: 72,
            clipPath: hexClip,
            background: `linear-gradient(135deg, ${cfg.color}18, ${cfg.bg})`,
            border: `2px solid ${isActive ? cfg.color : cfg.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.5rem',
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
              animate={{ opacity: [0, 0.6, 0, 0.6, 0] }}
              transition={{ duration: 1, times: [0, 0.2, 0.4, 0.6, 1] }}
              style={{
                position: 'absolute', inset: 0,
                background: 'rgba(229,56,79,0.4)',
                clipPath: hexClip,
              }}
            />
          )}
        </motion.div>

        {/* Active speaker indicator */}
        {isActive && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            style={{
              position: 'absolute',
              bottom: 0, right: 4,
              width: 12, height: 12,
              borderRadius: '50%',
              background: cfg.color,
              border: '2px solid var(--bg-base)',
              boxShadow: `0 0 8px ${cfg.color}`,
            }}
          />
        )}
      </div>

      {/* Name + role */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.78rem', fontWeight: 700,
          color: isActive ? cfg.color : 'var(--text-primary)',
          transition: 'color 0.3s',
        }}>
          {cfg.name}
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.6rem', color: 'var(--text-muted)',
          marginTop: 1, letterSpacing: '0.04em',
        }}>
          {cfg.role}
        </div>
      </div>
    </motion.div>
  )
}

export { PERSONA_CONFIG }
