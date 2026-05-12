// server/src/events/handlers/rollDice/doubles.ts
import type { Room } from '../../../rooms/Room'
import type { RoomView } from '../../../rooms/RoomManager'
import { broadcast, buildSyncPayload } from '../../../lib/ws-utils'

export interface DoubleResult {
  shouldStop: boolean    // true если обработка завершена (тюрьма)
  keepTurn: boolean      // true если ход сохраняется (1-2 дубля)
}

/**
 * Обрабатывает логику дублей:
 * - 1-2 дубля подряд → игрок сохраняет ход
 * - 3 дубля подряд → игрок отправляется в тюрьму
 */
export function processDoublesLogic(
  room: Room,
  playerId: string,
  isDouble: boolean,
  roomViews: Map<string, RoomView>
): DoubleResult {
  const player = room.getPlayer(playerId)
  if (!player) return { shouldStop: true, keepTurn: false }

  if (isDouble) {
    player.consecutiveDoubles = (player.consecutiveDoubles || 0) + 1

    // 🔑 3 дубля подряд → ТЮРЬМА НЕМЕДЛЕННО
    if (player.consecutiveDoubles >= 3) {
      sendToJail(room, playerId, '3 дубля подряд', roomViews)
      return { shouldStop: true, keepTurn: false }
    }

    // 1-2 дубля → сохраняем ход
    return { shouldStop: false, keepTurn: true }
  } else {
    // Не дубль → сбрасываем счётчик
    player.consecutiveDoubles = 0
    return { shouldStop: false, keepTurn: false }
  }
}

/**
 * Отправляет игрока в тюрьму с логированием и рассылкой
 */
export function sendToJail(
  room: Room,
  playerId: string,
  reason: string,
  roomViews: Map<string, RoomView>
): void {
  const player = room.getPlayer(playerId)
  if (!player) return

  player.pos = 10
  player.isInJail = true
  player.jailTurns = 0
  player.consecutiveDoubles = 0

  room.addLog(`🚔 ${player.name} отправлен в тюрьму! (${reason})`)
  broadcast(roomViews, room.id, { type: 'GO_TO_JAIL', playerId, reason })
  room.finishTurn()
}