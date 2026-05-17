// server/src/events/handlers/rollDice/index.ts
import type { Room } from '../../../rooms/Room'
import type { RoomView } from '../../../rooms/RoomManager'
import { broadcast, buildSyncPayload } from '../../../lib/ws-utils'
import { getSpaceById } from '../../../shared/boardConfig'

// 🔹 Импорт из СОСЕДНИХ файлов в той же папке (./file, не ../../)
import { processCellEffects, finalizeTurn } from './cell'
import { processDoublesLogic, sendToJail } from './doubles'  // 🔹 Создадим этот файл ниже
import { handleJailRoll } from './jail'

export function handleRollDice(
  room: Room,
  playerId: string,
  roomViews: Map<string, RoomView>,
  targetSpaceId?: number
): { success: boolean; actionRequired?: boolean } {
  const player = room.getPlayer(playerId)
  if (!player) return { success: false, error: 'Игрок не найден' }

  // 🔒 Валидация
  if (room.state.status !== 'PLAYING') return { success: false, error: '🚫 Игра не активна' }
  if (room.state.currentTurn !== playerId) return { success: false, error: '🚫 Не ваш ход' }
  if (room.state.actionPending !== 'NONE' && room.state.actionPending !== 'DOUBLE_TURN') {
    return { success: false, error: '🚫 Сначала завершите действие' }
  }

  // 🚔 Если в тюрьме — отдельная логика
  if (player.isInJail) {
    return handleJailRoll(room, playerId, roomViews)
  }

  // 🔹 === ОТЛАДКА: "заряженные" кубики ===
  const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV
  let d1: number, d2: number, total: number, isDouble: boolean

  if (isDev && targetSpaceId !== undefined && targetSpaceId >= 0 && targetSpaceId <= 39) {
    const steps = (targetSpaceId - player.pos + 40) % 40
    if (steps >= 2 && steps <= 12) {
      d1 = Math.min(6, steps - 1)
      d2 = steps - d1
      total = steps
      isDouble = d1 === d2
      console.log(`🎯 [DEBUG] Forced roll: ${d1}+${d2}=${total} → ${targetSpaceId}`)
    } else {
      d1 = Math.floor(Math.random() * 6) + 1
      d2 = Math.floor(Math.random() * 6) + 1
      total = d1 + d2
      isDouble = d1 === d2
      console.log(`⚠️ [DEBUG] Target ${targetSpaceId} unreachable → random`)
    }
  } else {
    d1 = Math.floor(Math.random() * 6) + 1
    d2 = Math.floor(Math.random() * 6) + 1
    total = d1 + d2
    isDouble = d1 === d2
  }

  room.state.lastDice = [d1, d2]

  // 🔹 3 дубля → тюрьма
  if (isDouble) {
    player.consecutiveDoubles++
    if (player.consecutiveDoubles >= 3) {
      sendToJail(room, playerId, roomViews)
      room.finishTurn()
      room.broadcastState()
      return { success: true }
    }
  } else {
    player.consecutiveDoubles = 0
  }

  // 🔹 Движение
  const oldPos = player.pos
  player.pos = (player.pos + total) % 40
  room.addLog(`🎲 ${player.name}: ${d1}+${d2} → ${player.pos}${isDouble ? ' (ДУБЛЬ!)' : ''}`)
  broadcast(roomViews, room.id, { type: 'PLAYER_MOVED', playerId, from: oldPos, to: player.pos, dice: [d1, d2] })

  // 💰 Проход СТАРТ
  if (player.pos < oldPos || (oldPos > 30 && player.pos <= 10)) {
    player.money += 200
    room.addLog(`💰 ${player.name} получил 200₽ за СТАРТ`)
  }

  // 🔹 Эффекты клетки
  const actionRequired = processCellEffects(room, playerId, player.pos, room.state.lastDice, roomViews)

  // 🔹 Завершение хода
  if (!actionRequired) {
    finalizeTurn(room, playerId, isDouble, false, roomViews)
  }

  room.broadcastState()
  return { success: true, actionRequired }
}