// server/src/events/handlers/rollDice.ts
import type { Room } from '../../rooms/Room'
import type { RoomView } from '../../rooms/RoomManager'
import { broadcast, buildSyncPayload } from '../../lib/ws-utils'
import { getSpaceById } from '../../shared/boardConfig'
import { handleDrawCard } from './cardAction'

// 🔹 Вынесенная логика обработки дублей и тюрьмы
function processDoublesLogic(
  room: Room,
  playerId: string,
  isDouble: boolean,
  roomViews: Map<string, RoomView>
): { shouldStop: boolean; keepTurn: boolean } {
  const player = room.getPlayer(playerId)
  if (!player) return { shouldStop: true, keepTurn: false }

  if (isDouble) {
    player.consecutiveDoubles = (player.consecutiveDoubles || 0) + 1

    // 🔑 3 дубля подряд → ТЮРЬМА НЕМЕДЛЕННО (без движения и обработки ячейки)
    if (player.consecutiveDoubles >= 3) {
      player.pos = 10
      player.isInJail = true
      player.jailTurns = 0
      player.consecutiveDoubles = 0
      room.addLog(`🚔 ${player.name} выбросил 3 дубля подряд → Тюрьма!`)
      broadcast(roomViews, room.id, { type: 'GO_TO_JAIL', playerId })
      room.finishTurn()
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

export function handleRollDice(
  room: Room,
  playerId: string,
  roomViews: Map<string, RoomView>,
  targetSpaceId?: number
) {
  const player = room.getPlayer(playerId)
  if (!player) return { error: 'Игрок не найден' }

  // 🔒 Валидация
  if (room.state.status !== 'PLAYING') return { error: '🚫 Игра не активна' }
  if (room.state.currentTurn !== playerId) return { error: '🚫 Не ваш ход' }
  if (room.state.actionPending !== 'NONE' && room.state.actionPending !== 'DOUBLE_TURN') {
    return { error: '🚫 Сначала завершите действие' }
  }

  // 🚔 ЛОГИКА ТЮРЬМЫ (если игрок уже в тюрьме)
  if (player.isInJail) {
    return handleJailRoll(room, playerId, roomViews)
  }

  // 🎲 Бросок костей
  const dice: [number, number] = [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)]
  const isDouble = dice[0] === dice[1]
  const oldPos = player.pos

  // 🔑 КРИТИЧНО: сначала обрабатываем дубли/тюрьму ДО любого движения
  const doubleResult = processDoublesLogic(room, playerId, isDouble, roomViews)
  if (doubleResult.shouldStop) {
    // Если ушли в тюрьму — рассылаем и выходим
    broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
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
  broadcast(roomViews, room.id, { type: 'PLAYER_MOVED', playerId, from: oldPos, to: finalPos, dice })

  // 💰 Проход через СТАРТ
  if (finalPos < oldPos || finalPos === 0) {
    player.money += 200
    room.addLog(`💰 ${player.name} получил 200₽ за СТАРТ`)
  }

  // 📍 Обработка ячейки
  const space = getSpaceById(finalPos)
  let actionRequired = false

  if (space) {
    actionRequired = processCellEffects(room, playerId, space, dice, roomViews)
  }

  // 🔄 Завершение хода или сохранение при дубле
  finalizeTurn(room, playerId, doubleResult.keepTurn, actionRequired, roomViews)

  broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
  return { success: true, actionRequired }
}

// 🔹 Обработка тюрьмы (вынесено)
function handleJailRoll(room: Room, playerId: string, roomViews: Map<string, RoomView>) {
  const player = room.getPlayer(playerId)
  if (!player) return { error: 'Игрок не найден' }

  const dice: [number, number] = [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)]
  const isDouble = dice[0] === dice[1]
  room.state.lastDice = dice

  room.addLog(`🎲 ${player.name}: ${dice[0]}+${dice[1]}${isDouble ? ' (ДУБЛЬ!)' : ''} → попытка выхода`)

  if (isDouble) {
    player.isInJail = false
    player.jailTurns = 0
    player.pos = (player.pos + dice[0] + dice[1]) % 40
    room.addLog(`🔓 ${player.name} вышел из тюрьмы по дублю!`)
    broadcast(roomViews, room.id, { type: 'PLAYER_MOVED', playerId, from: 10, to: player.pos, dice })
    room.finishTurn()
  } else {
    player.jailTurns = (player.jailTurns || 0) + 1
    if (player.jailTurns >= 3 && player.money >= 50) {
      player.money -= 50
      player.isInJail = false
      player.jailTurns = 0
      player.pos = (player.pos + dice[0] + dice[1]) % 40
      room.addLog(`💸 ${player.name} заплатил 50₽ за авто-выход из тюрьмы`)
      broadcast(roomViews, room.id, { type: 'PLAYER_MOVED', playerId, from: 10, to: player.pos, dice })
    } else {
      room.addLog(`❌ ${player.name} не выбросил дубль. Попытка ${player.jailTurns}/3`)
    }
    room.finishTurn()
  }

  broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
  return { success: true }
}

// 🔹 Обработка эффектов ячейки (вынесено)
function processCellEffects(
  room: Room,
  playerId: string,
  space: any,
  dice: [number, number],
  roomViews: Map<string, RoomView>
): boolean {
  const player = room.getPlayer(playerId)
  if (!player) return false

  // 🏠 Недвижимость
  if (space.type === 'property' || space.type === 'railroad') {
    const owner = room.state.players.find(p => p.properties?.includes(space.id))
    if (!owner) {
      room.state.actionPending = 'BUY'
      broadcast(roomViews, room.id, {
        type: 'OFFER_BUY',
        playerId,
        spaceId: space.id,
        price: space.price,
        name: space.name
      })
      return true
    } else if (owner.id !== playerId) {
      let rent = calculateRent(space, owner, dice)
      if (rent > 0) {
        const paid = Math.min(player.money, rent)
        owner.money += paid
        player.money -= paid
        const label = getHouseLabel(owner, space.id)
        room.addLog(`💸 ${player.name} заплатил ${paid}₽ аренды ${space.name} ${label}`)
        room.state.actionPending = 'INFO'
        broadcast(roomViews, room.id, {
          type: 'ACTION_REQUIRED',
          title: '💸 Аренда',
          message: `Оплачено ${paid}₽ ${label}`,
          icon: '💸',
          spaceId: space.id,
          amount: paid
        })
        return true
      }
    }
  }

  // 📉 Налоги
  else if (space.type === 'tax') {
    const tax = space.id === 4 ? 200 : 100
    player.money -= tax
    room.addLog(`📉 ${player.name} заплатил налог ${tax}₽`)
    room.state.actionPending = 'INFO'
    broadcast(roomViews, room.id, {
      type: 'ACTION_REQUIRED',
      title: '📉 Налог',
      message: `Налог ${tax}₽ списан`,
      icon: '📉',
      spaceId: space.id,
      amount: tax
    })
    return true
  }

  // 🃏 Карты
  else if (space.type === 'chance' || space.type === 'community') {
    return handleDrawCard(room, playerId, space.type, roomViews)?.actionRequired || false
  }

  // 🚔 Попадание на "ИДИ В ТЮРЬМУ"
  else if (space.type === 'go_to_jail') {
    player.pos = 10
    player.isInJail = true
    player.jailTurns = 0
    player.consecutiveDoubles = 0
    room.addLog(`🚔 ${player.name} отправлен в тюрьму!`)
    broadcast(roomViews, room.id, { type: 'GO_TO_JAIL', playerId })
    room.finishTurn()
    return true
  }

  return false
}

// 🔹 Завершение хода с учётом дублей (вынесено)
function finalizeTurn(
  room: Room,
  playerId: string,
  keepTurn: boolean,
  actionRequired: boolean,
  roomViews: Map<string, RoomView>
) {
  if (actionRequired) {
    // Если висит действие — ход не передаём, ждём ответа игрока
    return
  }

  if (keepTurn) {
    room.state.actionPending = 'DOUBLE_TURN'
    room.addLog(`🎲 ${room.getPlayer(playerId)?.name} сохраняет ход (дубль)`)
  } else {
    room.finishTurn()
  }
}

// 🔹 Вспомогательные функции
function calculateRent(space: any, owner: any, dice: [number, number]): number {
  if (space.type === 'railroad') {
    const rrCount = owner.properties.filter((id: number) => [5,15,25,35].includes(id)).length
    return 25 * Math.pow(2, rrCount - 1)
  }
  if ([12, 28].includes(space.id)) {
    const utilCount = owner.properties.filter((id: number) => [12,28].includes(id)).length
    return (dice[0] + dice[1]) * (utilCount === 2 ? 10 : 4)
  }
  const houseCount = owner.houses?.[space.id] || 0
  if (houseCount === 0) return space.baseRent
  if (houseCount <= 4 && space.rentWithHouse) return space.rentWithHouse[houseCount - 1]
  if (houseCount === 5) return space.rentWithHotel || space.baseRent * 10
  return space.baseRent
}

function getHouseLabel(owner: any, spaceId: number): string {
  const count = owner.houses?.[spaceId] || 0
  if (count === 0) return ''
  if (count === 5) return '🏨 Отель'
  return `🏠 Дом ${count}/4`
}