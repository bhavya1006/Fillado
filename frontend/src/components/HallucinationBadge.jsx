import { motion, AnimatePresence } from 'framer-motion'

/**
 * HallucinationBadge
 * Pulsing crimson badge that appears when the Thought Policeman fires.
 * Also shows which MCP tool was called to ground the agent.
 */
export default function HallucinationBadge({ visible, speaker, tool, count = 1 }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="hallucination-badge"
          initial={{ opacity: 0, x: 30, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 30, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          style={{
            position: 'absolute',
            top: -20, right: 0,
            zIndex: 100,
            display: 'flex', flexDirection: 'column', gap: 8,
            maxWidth: 320,
          }}
        >
          {/* Main badge */}
          <div style={{
            background: 'rgba(229,56,79,0.08)',
            border: '1px solid rgba(229,56,79,0.4)',
            borderRadius: 2,
            padding: '12px 16px',
            backdropFilter: 'blur(20px)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <motion.div
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: 'var(--accent-crimson)',
                  boxShadow: '0 0 8px rgba(229,56,79,0.5)',
                }}
              />
              <div>
                <div style={{
                  fontSize: '0.72rem', fontWeight: 700,
                  color: 'var(--accent-crimson)',
                  letterSpacing: '0.08em',
                  fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
                }}>
                  Context Corrected
                </div>
                <div style={{
                  fontSize: '0.6rem', color: 'rgba(229,56,79,0.6)',
                  fontWeight: 500, fontFamily: 'var(--font-mono)',
                }}>
                  Thought Policeman Intercepted
                </div>
              </div>
              <div style={{
                marginLeft: 'auto',
                background: 'rgba(229,56,79,0.15)',
                border: '1px solid rgba(229,56,79,0.3)',
                borderRadius: 2,
                padding: '2px 8px',
                fontSize: '0.68rem',
                fontWeight: 700,
                color: 'var(--accent-crimson)',
                fontFamily: 'var(--font-mono)',
              }}>
                ×{count}
              </div>
            </div>

            <div style={{
              fontSize: '0.7rem', color: 'var(--text-secondary)',
              lineHeight: 1.55, fontFamily: 'var(--font-body)',
            }}>
              {speaker && <><strong style={{ color: 'var(--accent-crimson)' }}>{speaker}</strong> was drifting off-topic.<br /></>}
              Groq <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.64rem',
                color: 'var(--accent-steel)',
              }}>llama-3.1-8b-instant</span> said <strong style={{ color: 'var(--accent-crimson)' }}>YES</strong>.
            </div>
          </div>

          {/* MCP tool used badge */}
          {tool && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              style={{
                background: 'rgba(212,175,55,0.06)',
                border: '1px solid rgba(212,175,55,0.2)',
                borderRadius: 2,
                padding: '9px 14px',
                display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <span style={{
                fontSize: '0.6rem', color: 'var(--accent-gold)', opacity: 0.7,
              }}>◆</span>
              <div>
                <div style={{
                  fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600,
                  fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}>
                  MCP Tool Triggered
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.7rem', color: 'var(--accent-gold)',
                  fontWeight: 600,
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
