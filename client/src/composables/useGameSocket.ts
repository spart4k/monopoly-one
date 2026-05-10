import { ref, onUnmounted } from 'vue'
import { useGameStore } from '../stores/game'
import { ServerEventSchema, type ClientEvent } from '../shared/events'

export function useGameSocket(url: string) {
  const store = useGameStore()
  let ws: WebSocket | null = null
  let reconnectTimer: number | null = null
  const eventQueue: ClientEvent[] = []
  const isConnected = ref(false)

  function connect() {
    if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return
    clearReconnect()
    ws = new WebSocket(url)

    ws.onopen = () => {
      isConnected.value = true
      console.log('🟢 WS: соединение открыто')
      while (eventQueue.length > 0) ws!.send(JSON.stringify(eventQueue.shift()!))
    }

    ws.onmessage = (event) => {
      console.log(event)
      console.log('📥 WS: получен сырой пакет:', event.data.slice(0, 150))
      try {
        const parsed = ServerEventSchema.parse(JSON.parse(event.data))
        console.log('📥 WS: валидация прошла успешно, вызываю store.applyEvent')
        store.applyEvent(parsed)
      } catch (e) {
        console.error('⚠️ WS: ошибка парсинга/валидации', e)
      }
    }

    ws.onclose = (e) => {
      isConnected.value = false
      ws = null
      console.log(`🔌 WS: закрыто (код ${e.code})`)
      scheduleReconnect()
    }

    ws.onerror = () => ws?.close()
  }

  function sendEvent(event: ClientEvent) {
    console.log('📤 WS: пытаюсь отправить', event)
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event))
      console.log('✅ WS: отправлено')
    } else {
      eventQueue.push(event)
      console.log('⏳ WS: сокет не открыт, ставлю в очередь')
      if (!ws || ws.readyState === WebSocket.CLOSED) connect()
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return
    reconnectTimer = window.setTimeout(() => { connect() }, 1500)
  }
  function clearReconnect() { if (reconnectTimer) clearTimeout(reconnectTimer) }

  onUnmounted(() => { clearReconnect(); ws?.close() })
  return { connect, sendEvent, isConnected }
}