// server/src/events/handlers/joinRoom.ts
import type { Room } from '../../rooms/Room'
import type { RoomManager } from '../../rooms/RoomManager'
import type { WebSocket } from 'ws'
import { buildSyncPayload } from '../../lib/ws-utils'

export async function handleJoinRoom(
  room: Room,
  playerId: string | undefined,
  playerName: string,
  sock: WebSocket,
  roomManager: RoomManager
) {
  console.log(`🔍 [JOIN] START: room=${room.id}, player=${playerName}(${playerId || 'new'})`)

  // 1. Генерируем или используем переданный ID
  const id = playerId && playerId !== 'null' && playerId !== 'undefined'
    ? playerId
    : `p_${Math.random().toString(36).substring(2, 10)}`

  const name = playerName?.trim().slice(0, 20) || `Player_${id.slice(-4)}`

  // 2. Создаём или обновляем игрока
  let player = room.getPlayer(id)
  if (!player) {
    player = room.addPlayer({
      id, name,
      color: room.getNextColor(), pos: 0, money: 1500,
      properties: [], houses: {}, mortgaged: [],
      isInJail: false, jailTurns: 0, jailCards: 0,
      consecutiveDoubles: 0, housesBoughtThisTurn: false,
      isReady: false, isBankrupt: false
    })
    console.log(`✅ [JOIN] Новый игрок создан: ${name} (${id})`)
  } else {
    player.name = name
    console.log(`♻️ [JOIN] Игрок обновлён: ${name} (${id})`)
  }

  // 3. Привязываем сокет
  room.addSocket(id, sock)
  console.log(`🔗 [JOIN] Socket привязан: ${id}, readyState=${sock.readyState}`)

  // 4. Формируем ответ
  const payload = buildSyncPayload(room.state)
  const message = JSON.stringify({
    type: 'SYNC_STATE',
    payload,
    ...(playerId !== id && { playerId: id, name })
  })

  // 5. Отправляем подключившемуся игроку
  if (sock.readyState === 1) {
    sock.send(message)
    console.log(`🚀 [JOIN] SYNC_STATE отправлен`)
  }

  // 6. Рассылаем остальным игрокам в комнате (без использования getAllRoomViews)
  if (!playerId) {
    const sockets = room.getSockets() // ✅ Это Map<string, WebSocket>
    for (const [pid, s] of sockets) {
      if (pid !== id && s.readyState === 1) {
        s.send(message)
      }
    }
  }

  console.log(`✅ [JOIN] DONE: ${name}`)
  return { success: true, playerId: id }
}