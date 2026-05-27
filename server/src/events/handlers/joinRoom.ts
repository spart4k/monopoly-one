// server/src/events/handlers/joinRoom.ts
import type { Room } from '../../rooms/Room'
import type { RoomManager } from '../../rooms/RoomManager'
import type { WebSocket } from 'ws'
import { buildSyncPayload, broadcast } from '../../lib/ws-utils'

export async function handleJoinRoom(
  room: Room,
  playerId: string | undefined,  // 🔹 Может быть undefined!
  playerName: string,
  sock: WebSocket,
  roomManager: RoomManager
) {
  console.log(`🔍 [JOIN] START: room=${room.id}, player=${playerName}(${playerId || 'new'})`)

  // 🔹 1. Валидация: roomId уже проверен в index.ts, playerId опционален
  // Ничего не блокируем, если playerId нет — сгенерируем ниже

  // 🔹 2. Если playerId не передан — генерируем новый
  const id = playerId && playerId !== 'null' && playerId !== 'undefined'
    ? playerId
    : `p_${Math.random().toString(36).substring(2, 10)}`

  // 🔹 3. Sanitise имени
  const name = playerName?.trim().slice(0, 20) || `Player_${id.slice(-4)}`

  // 🔹 4. Создаём или обновляем игрока
  let player = room.getPlayer(id)
  if (!player) {
    player = room.addPlayer({
      id,
      name,
      color: room.getNextColor(),
      pos: 0,
      money: 1500,
      properties: [],
      houses: {},
      mortgaged: [],
      isInJail: false,
      jailTurns: 0,
      jailCards: 0,
      consecutiveDoubles: 0,
      housesBoughtThisTurn: false,
      isReady: false,
      isBankrupt: false
    })
    console.log(`✅ [JOIN] Новый игрок создан: ${name} (${id})`)
  } else {
    // 🔹 Обновляем имя, если изменилось
    player.name = name
    console.log(`♻️ [JOIN] Игрок обновлён: ${name} (${id})`)
  }

  // 🔹 5. Привязываем сокет (критично!)
  room.addSocket(id, sock)
  console.log(`🔗 [JOIN] Socket привязан: ${id}, readyState=${sock.readyState}`)

  // 🔹 7. Формируем ответ с новым playerId (если создан)
  const payload = buildSyncPayload(room.state)
  const message = JSON.stringify({
    type: 'SYNC_STATE',
    payload,
    // 🔹 Отправляем клиенту его идентификатор для сохранения
    ...(playerId !== id && { playerId: id, name })
  })

  // 🔹 8. Отправляем ЭТОМУ игроку
  try {
    if (sock.readyState === 1) { // WebSocket.OPEN
      sock.send(message)
      console.log(`🚀 [JOIN] SYNC_STATE отправлен`)
    }
  } catch (e) {
    console.error(`💥 [JOIN] Ошибка отправки:`, e)
  }

  // 🔹 9. Рассылаем остальным (опционально, что новый игрок присоединился)
  const views = roomManager.getAllRoomViews()
  const roomViews = views.get(room.id)
  if (roomViews && !playerId) {  // Только если это новый игрок
    broadcast(roomViews, room.id, {
      type: 'PLAYER_JOINED',
      playerId: id,
      name,
      color: player.color
    })
  }

  console.log(`✅ [JOIN] DONE: ${name}`)
  return { success: true, playerId: id }
}