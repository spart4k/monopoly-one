// server/src/events/handlers/rollDice/index.ts
import type { Room } from '../../../rooms/Room'
import type { RoomView } from '../../../rooms/RoomManager'
import { broadcast, buildSyncPayload } from '../../../lib/ws-utils'
import { getSpaceById } from '../../../shared/boardConfig'

// 🔹 Импорт вынесенных хелперов
import { processDoublesLogic, sendToJail } from './doubles'
import { handleJailRoll } from './jail'
import { processCellEffects, finalizeTurn } from './cell'

/**
 * 🎲 Основной обработчик броска костей
 *
 * Поток:
 * 1. Валидация хода
 * 2. Если в тюрьме → handleJailRoll
 * 3. Бросок костей
 * 4. 🔑 Проверка дублей/тюрьмы (ДО движения!)
 * 5. Вычисление и применение позиции
 * 6. Бонус за СТАРТ
 * 7. Обработка ячейки
 * 8. Финализация хода
 */
export function handleRollDice(
  room: Room,
  playerId: string,
  roomViews: Map<string, RoomView>,
  targetSpaceId?: number
): { success: boolean; actionRequired?: boolean } {
  const player = room.getPlayer(playerId)
  if (!player) return { success: false }

  // 🔒 Валидация
  if (room.state.status !== 'PLAYING') {
    return { success: false, error: '🚫 Игра не активна' }
  }
  if (room.state.currentTurn !== playerId) {
    return { success: false, error: '🚫 Не ваш ход' }
  }
  if (room.state.actionPending !== 'NONE' && room.state.actionPending !== 'DOUBLE_TURN') {
    return { success: false, error: '🚫 Сначала завершите действие' }
  }

  // 🚔 Если игрок в тюрьме — специальная логика
  if (player.isInJail) {
    return handleJailRoll(room, playerId, roomViews)
  }

  // 🎲 Бросок костей
  const dice: [number, number] = [
    Math.ceil(Math.random() * 6),
    Math.ceil(Math.random() * 6)
  ]
  const isDouble = dice[0] === dice[1]
  const oldPos = player.pos

  // 🔑 КРИТИЧНО: сначала проверяем дубли/тюрьму ДО любого движения
  const doubleResult = processDoublesLogic(room, playerId, isDouble, roomViews)
  if (doubleResult.shouldStop) {
    // Игрок ушёл в тюрьму — рассылаем и выходим
    broadcast(roomViews, room.id, {
      type: 'SYNC_STATE',
      payload: buildSyncPayload(room.state)
    })
    return { success: true }
  }

  // 📍 Вычисляем новую позицию
  let finalPos = oldPos
  if (targetSpaceId !== undefined) {
    // Тестовый бросок: идём точно в цель
    let steps = (targetSpaceId - oldPos + 40) % 40
    if (steps === 0) steps = 40
    steps = Math.max(2, Math.min(12, steps))
    dice[0] = Math.floor(steps / 2)
    dice[1] = steps - dice[0]
    finalPos = targetSpaceId
  } else {
    finalPos = (oldPos + dice[0] + dice[1]) % 40
  }

  // 🔄 Применяем движение
  player.pos = finalPos
  room.state.lastDice = dice
  room.state.lastRollWasDouble = isDouble

  room.addLog(`🎲 ${player.name}: ${dice[0]}+${dice[1]}${isDouble ? ' (ДУБЛЬ!)' : ''} → ${finalPos}`)
  broadcast(roomViews, room.id, {
    type: 'PLAYER_MOVED',
    playerId,
    from: oldPos,
    to: finalPos,
    dice
  })

  // 💰 Проход через СТАРТ
  if (finalPos < oldPos || finalPos === 0) {
    player.money += 200
    room.addLog(`💰 ${player.name} получил 200₽ за СТАРТ`)
  }

  // 📍 Обработка ячейки
  const actionRequired = processCellEffects(room, playerId, finalPos, dice, roomViews)

  // 🔄 Завершение хода
  finalizeTurn(room, playerId, doubleResult.keepTurn, actionRequired, roomViews)

  broadcast(roomViews, room.id, {
    type: 'SYNC_STATE',
    payload: buildSyncPayload(room.state)
  })

  return { success: true, actionRequired }
}