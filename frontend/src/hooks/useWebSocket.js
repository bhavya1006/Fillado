import { useEffect, useRef, useCallback, useState } from 'react'

const WS_URL = 'ws://localhost:8000/ws/trading-floor'

/**
 * useWebSocket
 * Manages a persistent WebSocket connection to the Fillado backend.
 * Returns: { messages, status, lastMessage, connect, disconnect }
 */
export function useWebSocket() {
  const wsRef = useRef(null)
  const [status, setStatus] = useState('disconnected') // 'connecting' | 'connected' | 'disconnected' | 'error'
  const [messages, setMessages] = useState([])
  const [lastMessage, setLastMessage] = useState(null)
  const reconnectTimer = useRef(null)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return

    setStatus('connecting')
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      if (wsRef.current !== ws) return
      setStatus('connected')
      clearTimeout(reconnectTimer.current)
    }

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'ping') return
        setLastMessage(data)
        setMessages(prev => [...prev, data])
      } catch {
        // ignore malformed frames
      }
    }

    ws.onerror = () => {
      if (wsRef.current !== ws) return
      setStatus('error')
    }

    ws.onclose = () => {
      if (wsRef.current !== ws) return
      setStatus('disconnected')
      wsRef.current = null
      // Auto-reconnect after 3s
      reconnectTimer.current = setTimeout(() => {
        if (document.visibilityState !== 'hidden') connect()
      }, 3000)
    }
  }, [])

  const disconnect = useCallback(() => {
    clearTimeout(reconnectTimer.current)
    if (wsRef.current) {
      const ws = wsRef.current
      wsRef.current = null
      ws.close()
    }
    setStatus('disconnected')
  }, [])

  const clearMessages = useCallback(() => setMessages([]), [])

  useEffect(() => {
    connect()
    return () => { 
      clearTimeout(reconnectTimer.current)
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CONNECTING) {
        wsRef.current.close() 
      }
    }
  }, [connect])

  return { messages, lastMessage, status, connect, disconnect, clearMessages }
}
