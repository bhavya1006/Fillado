import { motion, AnimatePresence } from 'framer-motion'
import { PERSONA_CONFIG } from './AgentNode'
import ReactMarkdown from 'react-markdown'

/**
 * SpeechBubble
 * Streaming text bubble with left gold accent bar.
 * Tokens appear in real-time via WebSocket, cursor blinks while streaming.
 */
export default function SpeechBubble({ persona, text, isStreaming, hallucinated }) {
  const cfg = PERSONA_CONFIG[persona] || PERSONA_CONFIG.retail

  return (
    <AnimatePresence>
      {text && (
        <motion.div
          key={persona + '-bubble'}
          initial={{ opacity: 0, y: 10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 240, damping: 24 }}
          className={hallucinated ? 'hallucination-flash' : ''}
          style={{
            background: 'rgba(0,0,0,0.2)',
            border: `1px solid ${hallucinated ? 'rgba(229,56,79,0.5)' : cfg.border}`,
            borderRadius: 2,
            padding: 0,
            maxWidth: '100%',
            position: 'relative',
            display: 'flex',
            overflow: 'hidden',
          }}
        >
          {/* Left accent bar */}
          <div style={{
            width: 3, flexShrink: 0,
            background: `linear-gradient(to bottom, ${cfg.color}, ${cfg.color}44)`,
          }} />

          <div style={{ padding: '14px 18px', flex: 1, minWidth: 0 }}>
            {/* Speaker label */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
            }}>
              <span style={{
                fontFamily: 'var(--font-display)',
                fontSize: '0.88rem', fontWeight: 400, fontStyle: 'italic',
                color: cfg.color,
              }}>
                {cfg.name}
              </span>
              <span style={{
                fontSize: '0.58rem', color: 'var(--text-muted)',
                background: 'rgba(255,255,255,0.03)',
                padding: '2px 7px', borderRadius: 2,
                fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}>
                {cfg.role}
              </span>
              {isStreaming && (
                <motion.span
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  style={{
                    marginLeft: 'auto', fontSize: '0.58rem',
                    color: cfg.color, fontWeight: 700,
                    fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
                  }}
                >
                  ● LIVE
                </motion.span>
              )}
            </div>

            {/* Message text rendered as Markdown */}
            <div
              className={isStreaming ? 'cursor-blink markdown-wrapper' : 'markdown-wrapper'}
              style={{
                fontSize: '0.85rem',
                lineHeight: 1.7,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
                wordBreak: 'break-word',
              }}
            >
              <ReactMarkdown>{text}</ReactMarkdown>
            </div>

            {hallucinated && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                style={{
                  marginTop: 12,
                  padding: '6px 12px',
                  background: 'rgba(229,56,79,0.08)',
                  border: '1px solid rgba(229,56,79,0.3)',
                  borderRadius: 2,
                  fontSize: '0.68rem',
                  color: 'var(--accent-crimson)',
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
                }}
              >
                ▲ Context corrected by Thought Policeman — MCP tool invoked
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
