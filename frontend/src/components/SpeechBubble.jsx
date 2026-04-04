import { motion, AnimatePresence } from 'framer-motion'
import { PERSONA_CONFIG } from './AgentNode'
import ReactMarkdown from 'react-markdown'

/**
 * SpeechBubble
 * Streaming text bubble positioned next to the active speaker.
 * Tokens appear in real-time via WebSocket, cursor blinks while streaming.
 */
export default function SpeechBubble({ persona, text, isStreaming, hallucinated }) {
  const cfg = PERSONA_CONFIG[persona] || PERSONA_CONFIG.retail

  return (
    <AnimatePresence>
      {text && (
        <motion.div
          key={persona + '-bubble'}
          initial={{ opacity: 0, y: 10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          className={hallucinated ? 'hallucination-flash' : ''}
          style={{
            background: cfg.bg,
            border: `1px solid ${hallucinated ? 'rgba(244,63,94,0.6)' : cfg.border}`,
            borderRadius: 14,
            padding: '14px 18px',
            maxWidth: '100%',
            position: 'relative',
          }}
        >
          {/* Speaker label */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
          }}>
            <span style={{ fontSize: '1rem' }}>{cfg.emoji}</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: cfg.color }}>
              {cfg.name}
            </span>
            <span style={{
              fontSize: '0.65rem', color: 'var(--text-muted)',
              background: 'rgba(255,255,255,0.04)',
              padding: '1px 6px', borderRadius: 4,
            }}>
              {cfg.role}
            </span>
            {isStreaming && (
              <motion.span
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
                style={{
                  marginLeft: 'auto', fontSize: '0.65rem',
                  color: cfg.color, fontWeight: 600,
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
              fontSize: '0.88rem',
              lineHeight: 1.65,
              color: 'var(--text-primary)',
              fontFamily: 'Inter, sans-serif',
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
                marginTop: 10,
                padding: '6px 12px',
                background: 'rgba(244,63,94,0.12)',
                border: '1px solid rgba(244,63,94,0.4)',
                borderRadius: 8,
                fontSize: '0.72rem',
                color: '#f43f5e',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              ⚠ Context corrected by Thought Policeman — MCP tool invoked
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
