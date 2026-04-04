import { motion, AnimatePresence } from 'framer-motion'

/**
 * HallucinationBadge
 * Pulsing red badge that appears when the Thought Policeman fires.
 * Also shows which MCP tool was called to ground the agent.
 */
export default function HallucinationBadge({ visible, speaker, tool, count = 1 }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="hallucination-badge"
          initial={{ opacity: 0, x: 30, scale: 0.85 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 30, scale: 0.85 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
          style={{
            position: 'absolute',
            top: -20, right: 0,
            zIndex: 100,
            display: 'flex', flexDirection: 'column', gap: 8,
            maxWidth: 340,
          }}
        >
          {/* Main badge */}
          <div style={{
            background: 'rgba(244,63,94,0.12)',
            border: '1.5px solid rgba(244,63,94,0.6)',
            borderRadius: 12,
            padding: '12px 16px',
            backdropFilter: 'blur(20px)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <motion.div
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 0.6, repeat: Infinity }}
                style={{ fontSize: '1.1rem' }}
              >
                🔴
              </motion.div>
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#f43f5e', letterSpacing: '0.04em' }}>
                  CONTEXT CORRECTED
                </div>
                <div style={{ fontSize: '0.65rem', color: 'rgba(244,63,94,0.7)', fontWeight: 500 }}>
                  Thought Policeman Intercepted
                </div>
              </div>
              <div style={{
                marginLeft: 'auto',
                background: 'rgba(244,63,94,0.2)',
                border: '1px solid rgba(244,63,94,0.4)',
                borderRadius: 6,
                padding: '2px 8px',
                fontSize: '0.72rem',
                fontWeight: 700,
                color: '#f43f5e',
              }}>
                ×{count}
              </div>
            </div>

            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {speaker && <><strong style={{ color: '#f43f5e' }}>{speaker}</strong> was drifting off-topic.<br /></>}
              Groq <span style={{ fontFamily: 'monospace', fontSize: '0.68rem', color: '#818cf8' }}>llama-3.1-8b-instant</span> said <strong style={{ color: '#f43f5e' }}>YES</strong>.
            </div>
          </div>

          {/* MCP tool used badge */}
          {tool && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              style={{
                background: 'rgba(129,140,248,0.1)',
                border: '1px solid rgba(129,140,248,0.35)',
                borderRadius: 10,
                padding: '9px 14px',
                display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <span style={{ fontSize: '0.9rem' }}>🔌</span>
              <div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                  MCP TOOL TRIGGERED
                </div>
                <div style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '0.72rem', color: '#818cf8', fontWeight: 600,
                }}>
                  {tool}()
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
