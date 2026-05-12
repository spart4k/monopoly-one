// server/src/events/handlers/rollDice/jail.ts
import type { Room } from '../../../rooms/Room'
import type { RoomView } from '../../../rooms/RoomManager'
import { broadcast, buildSyncPayload } from '../../../lib/ws-utils'

/**
 * Обработка броска костей, когда игрок уже в тюрьме
 */
export function handleJailRoll(
  room: Room,
  playerId: string,
  roomViews: Map<string, RoomView>
): { success: boolean } {
  const player = room.getPlayer(playerId)
  if (!player) return { success: false }

  const dice: [number, number] = [
    Math.ceil(Math.random() * 6),
    Math.ceil(Math.random() * 6)
  ]
  const isDouble = dice[0] === dice[1]

  room.state.lastDice = dice
  room.addLog(`🎲 ${player.name}: ${dice[0]}+${dice[1]}${isDouble ? ' (ДУБЛЬ!)' : ''} → попытка выхода`)

  if (isDouble) {
    // ✅ Дубль → выход из тюрьмы и движение
    return handleJailEscape(room, playerId, dice, roomViews)
  } else {
    // ❌ Не дубль → считаем попытку
    return handleJailFailedAttempt(room, playerId, dice, roomViews)
  }
}

function handleJailEscape(
  room: Room,
  playerId: string,
  dice: [number, number],
  roomViews: Map<string, RoomView>
): { success: boolean } {
  const player = room.getPlayer(playerId)!
  const oldPos = player.pos

  player.isInJail = false
  player.jailTurns = 0
  player.pos = (oldPos + dice[0] + dice[1]) % 40

  room.addLog(`🔓 ${player.name} вышел из тюрьмы по дублю!`)
  broadcast(roomViews, room.id, {
    type: 'PLAYER_MOVED',
    playerId,
    from: oldPos,
    to: player.pos,
    dice
  })

  room.finishTurn()
  broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })

  return { success: true }
}

function handleJailFailedAttempt(
  room: Room,
  playerId: string,
  dice: [number, number],
  roomViews: Map<string, RoomView>
): { success: boolean } {
  const player = room.getPlayer(playerId)!

  player.jailTurns = (player.jailTurns || 0) + 1

  if (player.jailTurns >= 3 && player.money >= 50) {
    // 🔓 Авто-выход за 50₽ после 3 неудачных попыток
    player.money -= 50
    player.isInJail = false
    player.jailTurns = 0
    player.pos = (player.pos + dice[0] + dice[1]) % 40

    room.addLog(`💸 ${player.name} заплатил 50₽ за авто-выход из тюрьмы`)
    broadcast(roomViews, room.id, {
      type: 'PLAYER_MOVED',
      playerId,
      from: 10,
      to: player.pos,
      dice
    })
  } else {
    room.addLog(`❌ ${player.name} не выбросил дубль. Попытка ${player.jailTurns}/3`)
  }

  room.finishTurn()
  broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })

  return { success: true }
}