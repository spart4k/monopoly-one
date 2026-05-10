// client/src/lib/ws.ts
let ws: WebSocket | null = null
let reconnectAttempts = 0
const MAX_RECONNECT = 5

export function initWs(
  url: string,
  onMessage: (data: any) => void,
  onClose?: () => void
) {
  console.log(`🔌 [WS] initWs called for ${url}`)

  const connect = () => {
    console.log(`🔌 [WS] Connecting (attempt ${reconnectAttempts + 1})`)

    try {
      ws = new WebSocket(url)
    } catch (err) {
      console.error('💥 [WS] Constructor failed:', err)
      scheduleReconnect()
      return
    }

    ws.onopen = () => {
      console.log('✅ [WS] Connected! readyState:', ws?.readyState)
      reconnectAttempts = 0
    }

    ws.onmessage = (event) => {
      console.log('📥 [WS] Raw message received, length:', (event.data as string).length)
      try {
        const data = JSON.parse(event.data as string)
        console.log('🧩 [WS] Parsed event:', data.type, data)
        console.log('🔄 [WS] Calling onMessage callback...')
        onMessage(data)
        console.log('✅ [WS] onMessage callback completed')
      } catch (e) {
        console.error('❌ [WS] Parse error:', e, 'raw:', (event.data as string).slice(0, 200))
      }
    }

    ws.onclose = (e) => {
      console.log(`🔌 [WS] Closed (code=${e.code}, reason=${e.reason || 'none'})`)
      ws = null
      scheduleReconnect()
      onClose?.()
    }

    ws.onerror = (err) => {
      console.error('💥 [WS] Error event:', err)
    }
  }

  const scheduleReconnect = () => {
    if (reconnectAttempts >= MAX_RECONNECT) {
      console.error('🚫 [WS] Max reconnect attempts reached')
      return
    }
    reconnectAttempts++
    const delay = Math.min(1000 * reconnectAttempts, 5000)
    console.log(`🔄 [WS] Reconnecting in ${delay}ms`)
    setTimeout(connect, delay)
  }

  connect()

  return {
    send: (data: any) => {
      if (ws?.readyState === 1) {
        console.log('📤 [WS] Sending:', data.type)
        ws.send(JSON.stringify(data))
        return true
      }
      console.warn('⚠️ [WS] Send failed, readyState:', ws?.readyState)
      return false
    },
    close: () => {
      console.log('🔌 [WS] Manual close')
      reconnectAttempts = MAX_RECONNECT
      if (ws) { ws.close(); ws = null }
    },
    getReadyState: () => ws?.readyState ?? 3
  }
}

export function sendEvent(data: any) {
  if (ws?.readyState === 1) {
    ws.send(JSON.stringify(data))
    return true
  }
  console.warn('⚠️ [WS] sendEvent: not connected')
  return false
}

export function isWsReady(): boolean {
  return ws?.readyState === 1
}