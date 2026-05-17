// server/src/events/handlers/rollDice/cell.ts
import type { Room } from '../../../rooms/Room'
import type { RoomView } from '../../../rooms/RoomManager'
import { broadcast } from '../../../lib/ws-utils'
import { getSpaceById } from '../../../shared/boardConfig'
import {
  calculateRent,
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

  // 🔹 Бонус за прохождение СТАРТ
  const passBonus = calculatePassGoBonus(player.pos, spaceId)
  if (passBonus > 0) {
    player.money += passBonus
    room.addLog(`💰 ${player.name} получил ${passBonus}₽ за прохождение СТАРТ`)
  }

  if (space.type === 'property' || space.type === 'railroad' || space.type === 'utility') {
    return handlePropertyCell(room, playerId, space, dice, roomViews)
  }
  if (space.type === 'tax') return handleTaxCell(room, playerId, space, roomViews)
  if (space.type === 'chance' || space.type === 'community') {
    return handleCardCell(room, playerId, space.type, roomViews)
  }
  if (space.type === 'go_to_jail') return handleGoToJailCell(room, playerId, roomViews)

  return false
}

// 🔹 Обработка недвижимости / ЖД / коммуналок
function handlePropertyCell(
  room: Room,
  playerId: string,
  space: any,
  dice: [number, number],
  roomViews: Map<string, RoomView>
): boolean {
  const player = room.getPlayer(playerId)!

  // 🔹 КРИТИЧНО: БЕЗОПАСНАЯ ПРОВЕРКА ВЛАДЕНИЯ (с приведением типов)
  const isOwner = player.properties.some((prop: any) => Number(prop) === Number(space.id))
  if (isOwner) {
    // Игрок уже владеет улицей → НИЧЕГО НЕ ДЕЛАЕМ, ход перейдёт автоматически
    return false
  }

  // 🔹 Ищем ДРУГОГО владельца
  const owner = room.state.players.find(p =>
    p.id !== playerId &&
    p.properties?.some((prop: any) => Number(prop) === Number(space.id))
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
  const ownedUtils = owner.properties.filter((id: any) => [12, 28].includes(Number(id))).length
  const ownedRRs = owner.properties.filter((id: any) => [5, 15, 25, 35].includes(Number(id))).length
  const houses = owner.houses?.[space.id] || 0
  const diceSum = dice[0] + dice[1]

  const rent = calculateRent(space, houses, diceSum, ownedUtils, ownedRRs)

  room.state.pendingPayment = { amount: rent, creditorId: owner.id, type: 'rent' }
  room.state.actionPending = 'INFO'

  const label = houses === 0 ? '(базовая)' : houses === 4 ? '(🏨 отель)' : `(🏠 ${houses} дома)`
  room.addLog(`💸 ${player.name} должен заплатить ${rent}₽ аренды за ${space.name} ${label}`)

  broadcast(roomViews, room.id, {
    type: 'ACTION_REQUIRED',
    title: '💸 Аренда',
    message: `Аренда ${rent}₽ ${label}`,
    icon: '💸',
    spaceId: space.id,
    amount: rent,
    isMandatory: true
  })
  return true
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
    type: 'ACTION_REQUIRED', title: '📉 Налог', message: `Налог ${tax}₽`,
    icon: '📉', amount: tax, isMandatory: true
  })
  return true
}

// 🔹 Обработка карт
function handleCardCell(
  room: Room,
  playerId: string,
  cardType: 'chance' | 'community',
  roomViews: Map<string, RoomView>
): boolean {
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
  return false
}

// 🔹 Завершение хода
export function finalizeTurn(
  room: Room,
  playerId: string,
  keepTurn: boolean,
  actionRequired: boolean,
  roomViews: Map<string, RoomView>
): void {
  if (actionRequired) return

  if (keepTurn) {
    room.state.actionPending = 'DOUBLE_TURN'
    room.addLog(`🎲 ${room.getPlayer(playerId)?.name} сохраняет ход (дубль)`)
    room.broadcastState()
    return
  }

  const currentIdx = room.state.players.findIndex(p => p.id === playerId)
  const nextIdx = getNextPlayerIndex(room.state.players, currentIdx)
  room.state.currentTurn = room.state.players[nextIdx]?.id || room.state.currentTurn

  room.state.actionPending = 'NONE'
  room.broadcastState()
}