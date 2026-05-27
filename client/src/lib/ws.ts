// client/src/lib/ws.ts
import { ref } from 'vue'
import { myId, roomId, playerName } from '../composables/useSession'  // ✅ Добавили playerName

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

    // 🔹 Авто-вход с ником (без JWT!)
    const storedId = sessionStorage.getItem('monopoly_playerId')
    const storedRoom = sessionStorage.getItem('monopoly_roomId')
    const storedName = sessionStorage.getItem('monopoly_playerName')

    if (storedId && storedRoom) {
      console.log('🔄 [WS] Rejoining room:', storedRoom, 'as', storedName)
      ws?.send(JSON.stringify({
        type: 'JOIN_ROOM',
        playerId: storedId,
        roomId: storedRoom,
        name: storedName || 'Player'
      }))
    } else if (storedName) {
      console.log('📋 [WS] Requesting lobby as', storedName)
      ws?.send(JSON.stringify({
        type: 'GET_LOBBY',
        name: storedName
      }))
    } else {
      ws?.send(JSON.stringify({ type: 'GET_LOBBY' }))
    }
  }

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data as string)

      // 🔹 Обработка успешной регистрации ника
      if (data.type === 'NICKNAME_ACCEPTED') {
        myId.value = data.playerId
        playerName.value = data.nickname  // ✅ Теперь работает, т.к. импортировали
        sessionStorage.setItem('monopoly_playerId', data.playerId)
        sessionStorage.setItem('monopoly_playerName', data.nickname)

        console.log(`✅ [WS] Nick registered: ${data.nickname} (${data.playerId})`)

        // 🔹 Автоматически запрашиваем лобби после успешной регистрации
        setTimeout(() => sendEvent({ type: 'GET_LOBBY' }), 150)
        return // Прерываем, чтобы не дублировать в store
      }

      console.log('🧩 [WS] Parsed event:', data.type)
      onMessage(data)
    } catch (e) {
      console.error('❌ [WS] Parse error:', e)
    }
  }

  ws.onclose = () => {
    console.log('🔌 [WS] Closed')
    isConnected.value = false

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
      if (ws?.readyState !== 1) {
        console.warn('⚠️ [WS] Send failed, readyState:', ws?.readyState)
        return false
      }
      return sendEvent(payload)
    },
    close: () => ws?.close()
  }
}

// 🔹 Вынесенная функция отправки (используется и внутри initWs, и снаружи)
export function sendEvent(payload: any): boolean {
  if (ws?.readyState !== 1) {
    console.warn('⚠️ [WS] sendEvent: not connected (readyState:', ws?.readyState, ')')
    return false
  }

  // 🔹 Безопасные значения из сессии
  const safePlayerId = myId.value && myId.value !== 'null' ? myId.value : null
  const safeRoomId = roomId.value && roomId.value !== 'null' ? roomId.value : null

  // 🔹 События, которые НЕ требуют аутентификации (создают сессию)
  const allowsAnonymous = ['SET_NICKNAME', 'JOIN_ROOM', 'GET_LOBBY', 'REGISTER', 'LOGIN'].includes(payload.type)

  // 🔹 Проверка: если playerId в пейлоаде не совпадает с сессией → блокируем (защита от подмены)
  if (payload.playerId !== undefined && !allowsAnonymous) {
    const sessionPlayerId = myId.value || sessionStorage.getItem('monopoly_playerId')
    if (payload.playerId !== sessionPlayerId) {
      console.error(`❌ [WS] Blocked send: playerId mismatch`, {
        myId: myId.value,
        stored: sessionStorage.getItem('monopoly_playerId'),
        payloadType: payload.type,
        payloadId: payload.playerId
      })
      return false
    }
  }

  // 🔹 Для игровых событий требуем, чтобы игрок был в сессии
  const requiresAuth = !allowsAnonymous
  if (requiresAuth && !safePlayerId && !sessionStorage.getItem('monopoly_playerId')) {
    console.warn(`⚠️ [WS] Auth required for ${payload.type}, but no playerId in session`)
    // Не блокируем жестко — пусть сервер сам отклонит, если нужно
  }

  // 🔹 Формируем финальный пейлоад
  const finalPayload = {
    ...payload,
    playerId: safePlayerId || payload.playerId,
    roomId: safeRoomId || payload.roomId
  }

  console.log('📤 [WS] Sending:', finalPayload.type, 'playerId:', finalPayload.playerId, 'roomId:', finalPayload.roomId)

  try {
    ws?.send(JSON.stringify(finalPayload))
    return true
  } catch (e) {
    console.error('💥 [WS] Send error:', e)
    return false
  }
}

export function isWsReady(): boolean {
  return ws?.readyState === 1
}

export type WsEvent =
  | { type: 'SYNC_STATE'; payload: any }
  | { type: 'ACTION_REQUIRED'; title: string; message: string; amount?: number; spaceId?: number }
  | { type: 'GO_TO_JAIL'; playerId: string }
  | { type: 'JAIL_SENTENCED'; playerId: string; message: string }
  | { type: 'ROOMS_LIST'; rooms: any[] }
  | { type: 'MY_ID'; playerId: string; roomId: string }
  | { type: 'NICKNAME_ACCEPTED'; playerId: string; nickname: string }  // 🔹 Добавили тип
  | { type: 'ERROR'; message: string }