// server/src/events/handlers/rollDice/doubles.ts
import type { Room } from '../../../rooms/Room'
import type { RoomView } from '../../../rooms/RoomManager'
import { broadcast } from '../../../lib/ws-utils'

/** 🔹 Проверяет дубли и возвращает, нужно ли остановить ход */
export function processDoublesLogic(
  room: Room,
  playerId: string,
  isDouble: boolean,
  roomViews: Map<string, RoomView>
): { shouldStop: boolean; keepTurn: boolean } {
  const player = room.getPlayer(playerId)
  if (!player) return { shouldStop: false, keepTurn: false }

  if (isDouble) {
    player.consecutiveDoubles = (player.consecutiveDoubles || 0) + 1
    if (player.consecutiveDoubles >= 3) {
      // 3 дубля → тюрьма
      return { shouldStop: true, keepTurn: false }
    }
    // Дубль < 3 → игрок ходит снова
    return { shouldStop: false, keepTurn: true }
  } else {
    player.consecutiveDoubles = 0
    return { shouldStop: false, keepTurn: false }
  }
}

/** 🔹 Отправляет игрока в тюрьму */
export function sendToJail(
  room: Room,
  playerId: string,
  roomViews: Map<string, RoomView>
) {
  const player = room.getPlayer(playerId)
  if (!player) return

  player.pos = 10
  player.isInJail = true
  player.jailTurns = 0
  player.consecutiveDoubles = 0

  room.addLog(`🚔 ${player.name} отправлен в тюрьму за 3 дубля!`)
  broadcast(roomViews, room.id, { type: 'GO_TO_JAIL', playerId })
}