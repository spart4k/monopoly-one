// client/src/lib/ws.ts
import { ref } from 'vue'
import { myId, roomId } from '../composables/useSession'

let ws: WebSocket | null = null
let reconnectAttempts = 0
const MAX_RECONNECT = 5

export const isConnected = ref(false)

export function initWs(
  url: string,
  onMessage: (data: any) => void,
  onClose?: () => void
) {
  console.log('🔌 [WS] Initializing connection to', url)

  ws = new WebSocket(url)

  ws.onopen = () => {
    isConnected.value = true
    reconnectAttempts = 0
    console.log('✅ [WS] Connected!')

    // 🔑 Авто-вход, если сессия есть
    const storedId = sessionStorage.getItem('monopoly_playerId')
    const storedRoom = sessionStorage.getItem('monopoly_roomId')
    const storedName = sessionStorage.getItem('monopoly_playerName')

    if (storedId && storedId !== 'null' && storedRoom && storedRoom !== 'null') {
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
    try {
      const data = JSON.parse(event.data as string)
      console.log('🧩 [WS] Parsed event:', data.type)
      onMessage(data)
    } catch (e) {
      console.error('❌ [WS] Parse error:', e)
    }
  }

  ws.onclose = () => {
    console.log('🔌 [WS] Closed')
    isConnected.value = false

    // 🔁 Авто-реконнект (только если были попытки взаимодействия)
    if (reconnectAttempts < MAX_RECONNECT) {
      reconnectAttempts++
      const delay = Math.min(1000 * reconnectAttempts, 5000)
      console.log(`🔄 [WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT})`)
      setTimeout(() => initWs(url, onMessage, onClose), delay)
    } else {
      console.warn('⚠️ [WS] Max reconnect attempts reached')
      onClose?.()
    }
  }

  ws.onerror = (error) => {
    console.error('💥 [WS] Error:', error)
  }

  return {
    send: (payload: any) => {
      if (ws?.readyState === 1) {
        // 🔑 Безопасный получатель ID
        const safePlayerId = myId.value && myId.value !== 'null' ? myId.value : null
        const safeRoomId = roomId.value && roomId.value !== 'null' ? roomId.value : null

        // 🔑 Если нет валидного playerId — не отправляем игровые действия
        if (payload.playerId !== undefined && !safePlayerId) {
          console.error('❌ [WS] Blocked send: invalid playerId', {
            myId: myId.value,
            stored: sessionStorage.getItem('monopoly_playerId'),
            payloadType: payload.type
          })
          return false
        }

        const finalPayload = {
          ...payload,
          playerId: safePlayerId || payload.playerId,
          roomId: safeRoomId || payload.roomId
        }

        console.log('📤 [WS] Sending:', finalPayload.type, 'playerId:', finalPayload.playerId, 'roomId:', finalPayload.roomId)
        ws.send(JSON.stringify(finalPayload))
        return true
      }
      console.warn('⚠️ [WS] Send failed, readyState:', ws?.readyState)
      return false
    },
    close: () => ws?.close()
  }
}

export function sendEvent(payload: any) {
  if (ws?.readyState !== 1) {
    console.warn('⚠️ [WS] sendEvent: not connected (readyState:', ws?.readyState, ')')
    return false
  }

  // 🔑 Безопасный получатель ID
  const safePlayerId = myId.value && myId.value !== 'null' ? myId.value : null
  const safeRoomId = roomId.value && roomId.value !== 'null' ? roomId.value : null

  // 🔑 Если нет валидного playerId — не отправляем игровые действия
  if (payload.playerId !== undefined && !safePlayerId) {
    console.error(`❌ [WS] Blocked send: invalid playerId`, {
      myId: myId.value,
      stored: sessionStorage.getItem('monopoly_playerId'),
      payloadType: payload.type
    })
    return false
  }

  const finalPayload = {
    ...payload,
    playerId: safePlayerId || payload.playerId,
    roomId: safeRoomId || payload.roomId
  }

  console.log('📤 [WS] Sending:', finalPayload.type, 'playerId:', finalPayload.playerId, 'roomId:', finalPayload.roomId)
  ws.send(JSON.stringify(finalPayload))
  return true
}

export function isWsReady(): boolean {
  return ws?.readyState === 1
}

export type WsEvent =
  | { type: 'SYNC_STATE'; payload: any }
  | { type: 'ACTION_REQUIRED'; title: string; message: string; amount?: number; spaceId?: number }
  | { type: 'GO_TO_JAIL'; playerId: string }
  | { type: 'JAIL_SENTENCED'; playerId: string; message: string } // 🔹 Новое
  | { type: 'ROOMS_LIST'; rooms: any[] }
  | { type: 'MY_ID'; playerId: string; roomId: string }
  | { type: 'ERROR'; message: string }