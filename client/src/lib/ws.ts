// client/src/lib/ws.ts
import { ref } from 'vue'
import {useSession} from "../composables/useSession.ts";
const { myId, roomId } = useSession()

let ws: WebSocket | null = null
let reconnectAttempts = 0
const MAX_RECONNECT = 5

// 🔑 Реактивный статус подключения (для UI)
export const isConnected = ref(false)

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
      isConnected.value = true
      console.log('✅ [WS] Connected!')

      // 🔑 Авто-вход, если сессия есть
      const storedId = sessionStorage.getItem('monopoly_playerId')
      const storedRoom = sessionStorage.getItem('monopoly_roomId')
      const storedName = sessionStorage.getItem('monopoly_playerName')

      if (storedId && storedRoom) {
        console.log('🔄 [WS] Auto-rejoining:', storedId, 'in room', storedRoom)
        ws?.send(JSON.stringify({
          type: 'JOIN_ROOM',
          playerId: storedId,
          roomId: storedRoom,
          name: storedName || 'Reconnecting'
        }))
      } else {
        ws?.send(JSON.stringify({ type: 'GET_LOBBY' }))
      }
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
      isConnected.value = false // 🔑 Обновляем статус
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
      isConnected.value = false
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
      isConnected.value = false
      if (ws) { ws.close(); ws = null }
    },
    getReadyState: () => ws?.readyState ?? 3
  }
}

export function sendEvent(data: any) {
  if (ws?.readyState === 1) {
    const payload = {
      ...data,
      playerId: myId.value || data.playerId,
      // 🔑 КРИТИЧНО: явный ввод (data.roomId) имеет приоритет над кэшем
      roomId: data.roomId || roomId.value
    }
    console.log('📤 [WS] Sending:', payload.type, 'roomId:', payload.roomId)
    ws.send(JSON.stringify(payload))
    return true
  }
  console.warn('⚠️ [WS] sendEvent: not connected')
  return false
}

export function isWsReady(): boolean {
  return ws?.readyState === 1
}