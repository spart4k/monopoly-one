// server/src/events/handlers/joinRoom.ts
import type { Room } from '../../rooms/Room'
import type { RoomManager } from '../../rooms/RoomManager'
import type { WebSocket } from 'ws'
import { buildSyncPayload } from '../../lib/ws-utils'

export async function handleJoinRoom(
  room: Room,
  playerId: string,
  playerName: string,
  sock: WebSocket,
  roomManager: RoomManager
) {
  console.log(`🔍 [JOIN] START: room=${room.id}, player=${playerName}(${playerId})`)

  // 1. Создаем или обновляем игрока
  let player = room.getPlayer(playerId)
  if (!player) {
    player = room.addPlayer({
      id: playerId,
      name: playerName,
      color: room.getNextColor(),
      pos: 0,
      money: 1500
    })
    console.log(`✅ [JOIN] Новый игрок создан: ${playerName}`)
  } else {
    console.log(`♻️ [JOIN] Игрок уже есть, обновляем: ${playerName}`)
  }

  // 2. Привязываем сокет (критично!)
  room.addSocket(playerId, sock)
  console.log(`🔗 [JOIN] Socket привязан: ${playerId}, readyState=${sock.readyState}`)

  // 3. Старт игры если 2+ игрока
  if (room.state.status === 'LOBBY' && room.playerCount >= 2) {
    room.startGame()
    console.log(`🎮 [JOIN] Игра стартовала!`)
  }

  // 4. Формируем ответ
  const payload = buildSyncPayload(room.state)
  const message = JSON.stringify({ type: 'SYNC_STATE', payload })
  console.log(`📦 [JOIN] Готовим ответ, длина: ${message.length} байт`)

  // 5. Отправляем ЭТОМУ игроку (синхронно, до возврата из функции)
  try {
    if (sock.readyState === 1) { // WebSocket.OPEN
      sock.send(message)
      console.log(`🚀 [JOIN] SYNC_STATE отправлен через sock.send()`)
    } else {
      console.error(`❌ [JOIN] Socket не открыт! readyState=${sock.readyState}`)
    }
  } catch (e) {
    console.error(`💥 [JOIN] Ошибка отправки:`, e)
  }

  // 6. Рассылаем остальным (опционально)
  const views = roomManager.getAllRoomViews()
  const roomViews = views.get(room.id)
  if (roomViews) {
    for (const [pid, s] of roomViews) {
      if (pid !== playerId && s.readyState === 1) {
        s.send(message)
        console.log(`📢 [JOIN] Broadcast to ${pid}`)
      }
    }
  }

  console.log(`✅ [JOIN] DONE: ${playerName}`)
  return { success: true }
}