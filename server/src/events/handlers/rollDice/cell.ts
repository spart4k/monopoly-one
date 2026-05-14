// server/src/events/handlers/rollDice/cell.ts
import type { Room } from '../../../rooms/Room'
import type { RoomView } from '../../../rooms/RoomManager'
import { broadcast, buildSyncPayload } from '../../../lib/ws-utils'
import { getSpaceById } from '../../../shared/boardConfig'
import { calculateRent, getHouseLabel } from '../../../lib/rentCalculator'
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

  // 🏠 Недвижимость и ЖД вокзалы
  if (space.type === 'property' || space.type === 'railroad') {
    return handlePropertyCell(room, playerId, space, dice, roomViews)
  }

  // 📉 Налоги
  if (space.type === 'tax') {
    return handleTaxCell(room, playerId, space, roomViews)
  }

  // 🃏 Карты
  if (space.type === 'chance' || space.type === 'community') {
    return handleCardCell(room, playerId, space.type, roomViews)
  }

  // 🚔 "ИДИ В ТЮРЬМУ"
  if (space.type === 'go_to_jail') {
    return handleGoToJailCell(room, playerId, roomViews)
  }

  return false
}

// 🔹 Аренда — ТОЛЬКО устанавливаем pendingPayment, НЕ списываем!
function handlePropertyCell(
  room: Room, playerId: string, space: any, dice: [number, number], roomViews: Map<string, RoomView>
): boolean {
  console.log(`🚨 [CELL-NEW] handlePropertyCell CALLED for space ${space.id}`)  // ← УНИКАЛЬНЫЙ лог
  const owner = room.state.players.find(p => p.properties?.includes(space.id))

  if (!owner) {
    room.state.actionPending = 'BUY'
    broadcast(roomViews, room.id, { type: 'OFFER_BUY', playerId, spaceId: space.id, price: space.price, name: space.name })
    return true
  }

  if (owner.id !== playerId) {
    const rent = calculateRent(space.id, owner.id, room.state.players, dice)
    const label = getHouseLabel(owner, space.id)

    // 🔑 КРИТИЧНО: НЕ ТРОГАЕМ ДЕНЬГИ! Только состояние
    room.state.pendingPayment = { amount: rent, creditorId: owner.id, type: 'rent' }
    console.log(`🔍 [CELL] Set pendingPayment for rent:`, JSON.stringify(room.state.pendingPayment))
    room.state.actionPending = 'INFO'

    room.addLog(`💸 ${room.getPlayer(playerId)?.name} должен заплатить ${rent}₽ аренды за ${space.name} ${label}`)
    console.log(`🔍 [DEBUG] pendingPayment SET:`, JSON.stringify(room.state.pendingPayment))

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

  return false
}

// 🔹 Налог — ТОЛЬКО устанавливаем pendingPayment, НЕ списываем!
function handleTaxCell(
  room: Room, playerId: string, space: any, roomViews: Map<string, RoomView>
): boolean {
  const tax = space.id === 4 ? 200 : 100

  // 🔑 КРИТИЧНО: НЕ ТРОГАЕМ ДЕНЬГИ! Только состояние
  room.state.pendingPayment = { amount: tax, creditorId: null, type: 'tax' }
  console.log(`🔍 [CELL] Set pendingPayment for tax:`, JSON.stringify(room.state.pendingPayment))
  room.state.actionPending = 'INFO'

  room.addLog(`📉 ${room.getPlayer(playerId)?.name} должен заплатить налог ${tax}₽`)
  broadcast(roomViews, room.id, {
    type: 'ACTION_REQUIRED',
    title: '📉 Налог',
    message: `Налог ${tax}₽`,
    icon: '📉',
    spaceId: space.id,
    amount: tax,
    isMandatory: true
  })
  return true
}

// 🔹 Карты
function handleCardCell(
  room: Room, playerId: string, cardType: string, roomViews: Map<string, RoomView>
): boolean {
  const result = handleDrawCard(room, playerId, cardType, roomViews)
  return result?.actionRequired || false
}

// 🔹 "Иди в тюрьму"
function handleGoToJailCell(
  room: Room, playerId: string, roomViews: Map<string, RoomView>
): boolean {
  const player = room.getPlayer(playerId)!
  player.pos = 10
  player.isInJail = true
  player.jailTurns = 0
  player.consecutiveDoubles = 0

  room.addLog(`🚔 ${player.name} отправлен в тюрьму!`)
  broadcast(roomViews, room.id, { type: 'GO_TO_JAIL', playerId })
  room.finishTurn()
  return true
}

// 🔹 Завершение хода
export function finalizeTurn(
  room: Room, playerId: string, keepTurn: boolean, actionRequired: boolean, roomViews: Map<string, RoomView>
): void {
  if (actionRequired) return
  if (keepTurn) {
    room.state.actionPending = 'DOUBLE_TURN'
    room.addLog(`🎲 ${room.getPlayer(playerId)?.name} сохраняет ход (дубль)`)
  } else {
    room.finishTurn()
  }
}