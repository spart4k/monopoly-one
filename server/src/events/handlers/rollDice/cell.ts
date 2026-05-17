// server/src/events/handlers/rollDice/cell.ts
import type { Room } from '../../../rooms/Room'
import type { RoomView } from '../../../rooms/RoomManager'
import { broadcast } from '../../../lib/ws-utils'
import { getSpaceById } from '../../../shared/boardConfig'
import {
  calculateRent,
  processPayment,
  getNextPlayerIndex,
  calculatePassGoBonus
} from '../../../lib/gameRules'
import { handleDrawCard } from '../cardAction'

export function processCellEffects(
  room: Room,
  playerId: string,
  spaceId: number,
  dice: [number, number],
  roomViews: Map<string, RoomView>
): boolean {
  const player = room.getPlayer(playerId)
  const space = getSpaceById(spaceId)
  if (!player || !space) return false

  // 🔹 Проход через СТАРТ (бонус +200₽)
  const passBonus = calculatePassGoBonus(player.pos, spaceId)
  if (passBonus > 0) {
    player.money += passBonus
    room.addLog(`💰 ${player.name} получил ${passBonus}₽ за прохождение СТАРТ`)
  }

  // 🔹 Маршрутизация по типу клетки
  if (space.type === 'property' || space.type === 'railroad' || space.type === 'utility') {
    return handlePropertyCell(room, playerId, space, dice, roomViews)
  }
  if (space.type === 'tax') return handleTaxCell(room, playerId, space, roomViews)
  if (space.type === 'chance' || space.type === 'community') {
    return handleCardCell(room, playerId, space.type, roomViews)
  }
  if (space.type === 'go_to_jail') return handleGoToJailCell(room, playerId, roomViews)

  return false // Нет действий → ход завершится автоматически
}

// 🔹 Обработка недвижимости / ЖД / коммуналок
function handlePropertyCell(
  room: Room,
  playerId: string,
  space: any,
  dice: [number, number],
  roomViews: Map<string, RoomView>
): boolean {
  // 🔹 Ищем владельца (не сам игрок, не банкрот)
  const owner = room.state.players.find(p =>
    p.properties?.includes(space.id) &&
    p.id !== playerId &&
    !p.isBankrupt
  )

  // 🔹 Если нет владельца → можно купить
  if (!owner) {
    if (space.price > 0) {
      room.state.actionPending = 'BUY'
      room.state.selectedSpaceId = space.id
      broadcast(roomViews, room.id, {
        type: 'ACTION_REQUIRED',
        title: '🏠 Покупка',
        message: `Купить ${space.name} за ${space.price}₽?`,
        icon: '🏠',
        spaceId: space.id,
        amount: space.price,
        isMandatory: false
      })
      return true
    }
    return false
  }

  // 🔹 Если владелец — другой игрок → считаем аренду
  if (owner.id !== playerId) {
    // 🔹 Подсчёт количества владений для формул
    const ownedUtils = owner.properties.filter((id: number) => [12, 28].includes(id)).length
    const ownedRRs = owner.properties.filter((id: number) => [5, 15, 25, 35].includes(id)).length
    const houses = owner.houses?.[space.id] || 0
    const diceSum = dice[0] + dice[1]

    // 🔹 Расчёт через gameRules.ts
    const rent = calculateRent(space, houses, diceSum, ownedUtils, ownedRRs)

    // 🔹 КРИТИЧНО: НЕ СПИСЫВАЕМ! Только устанавливаем pending
    room.state.pendingPayment = { amount: rent, creditorId: owner.id, type: 'rent' }
    room.state.actionPending = 'INFO'

    const label = houses === 0 ? '(базовая)' : houses === 4 ? '(🏨 отель)' : `(🏠 ${houses} дома)`
    room.addLog(`💸 ${room.getPlayer(playerId)?.name} должен заплатить ${rent}₽ аренды за ${space.name} ${label}`)

    broadcast(roomViews, room.id, {
      type: 'ACTION_REQUIRED',
      title: '💸 Аренда',
      message: `Аренда ${rent}₽ ${label}`,
      icon: '💸',
      spaceId: space.id,
      amount: rent,
      isMandatory: true
    })
    return true // Требуется действие игрока
  }

  // 🔹 Игрок на своей клетке → ничего не делаем
  return false
}

// 🔹 Обработка налогов
function handleTaxCell(
  room: Room,
  playerId: string,
  space: any,
  roomViews: Map<string, RoomView>
): boolean {
  const tax = space.price || (space.id === 4 ? 200 : 100)

  room.state.pendingPayment = { amount: tax, creditorId: null, type: 'tax' }
  room.state.actionPending = 'INFO'

  room.addLog(`📉 ${room.getPlayer(playerId)?.name} должен заплатить налог ${tax}₽`)
  broadcast(roomViews, room.id, {
    type: 'ACTION_REQUIRED',
    title: '📉 Налог',
    message: `Налог ${tax}₽`,
    icon: '📉',
    amount: tax,
    isMandatory: true
  })
  return true
}

// 🔹 Обработка карт Шанс/Казна
function handleCardCell(
  room: Room,
  playerId: string,
  cardType: 'chance' | 'community',
  roomViews: Map<string, RoomView>
): boolean {
  // 🔹 handleDrawCard уже содержит логику вытягивания и эффектов
  const result = handleDrawCard(room, playerId, cardType, roomViews)
  return result?.actionRequired || false
}

// 🔹 Клетка "Иди в тюрьму"
function handleGoToJailCell(
  room: Room,
  playerId: string,
  roomViews: Map<string, RoomView>
): boolean {
  const player = room.getPlayer(playerId)
  if (!player) return false

  player.pos = 10
  player.isInJail = true
  player.jailTurns = 0
  player.consecutiveDoubles = 0

  room.addLog(`🚔 ${player.name} отправлен в тюрьму!`)
  broadcast(roomViews, room.id, { type: 'GO_TO_JAIL', playerId })

  // 🔹 В тюрьму ход переходит сразу
  return false
}

// 🔹 Завершение хода (вызывается из rollDice.ts / buyProperty.ts)
export function finalizeTurn(
  room: Room,
  playerId: string,
  keepTurn: boolean,
  actionRequired: boolean,
  roomViews: Map<string, RoomView>
): void {
  // 🔹 Если требуется действие → не завершаем ход
  if (actionRequired) return

  // 🔹 Дубль → игрок ходит снова
  if (keepTurn) {
    room.state.actionPending = 'DOUBLE_TURN'
    room.addLog(`🎲 ${room.getPlayer(playerId)?.name} сохраняет ход (дубль)`)
    room.broadcastState()
    return
  }

  // 🔹 Обычный переход хода (с пропуском банкротов)
  const currentIdx = room.state.players.findIndex(p => p.id === playerId)
  const nextIdx = getNextPlayerIndex(room.state.players, currentIdx)
  room.state.currentTurn = room.state.players[nextIdx]?.id || room.state.currentTurn

  room.state.actionPending = 'NONE'
  room.broadcastState()
}