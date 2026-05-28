import { useEffect, useRef, useCallback, useState } from "react"

export function useKanbanWebSocket(onUpdate: () => void) {
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  const connect = useCallback(() => {
    const proto = location.protocol === "https:" ? "wss:" : "ws:"
    const ws = new WebSocket(`${proto}//${location.host}/ws/kanban`)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === "kanban_update") {
          onUpdateRef.current()
        }
      } catch {}
    }

    ws.onclose = () => {
      setConnected(false)
      wsRef.current = null
      // Reconnect with backoff
      setTimeout(connect, 2000 + Math.random() * 3000)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      const ws = wsRef.current
      if (ws) {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.onopen = () => ws.close()
          ws.onmessage = null
          ws.onclose = null
          ws.onerror = null
        } else {
          ws.onclose = null
          ws.onerror = null
          ws.close()
        }
      }
      wsRef.current = null
    }
  }, [connect])

  return connected
}
