// server/src/events/handlers/rollDice/cell.ts
import type { Room } from '../../../rooms/Room'
import type { RoomView } from '../../../rooms/RoomManager'
import { broadcast } from '../../../lib/ws-utils'
import { getSpaceById } from '../../../shared/boardConfig'
import { calculateRent, getNextPlayerIndex, calculatePassGoBonus } from '../../../lib/gameRules'
import { handleDrawCard } from '../cardAction'

export function processCellEffects(
  room: Room, playerId: string, spaceId: number, dice: [number, number], roomViews: Map<string, RoomView>
): boolean {
  const player = room.getPlayer(playerId)
  const space = getSpaceById(spaceId)
  if (!player || !space) return false

  const passBonus = calculatePassGoBonus(player.pos, spaceId)
  if (passBonus > 0) {
    player.money += passBonus
    room.addLog(`💰 ${player.name} получил ${passBonus}₽ за прохождение СТАРТ`)
  }

  if (['property', 'railroad', 'utility'].includes(space.type)) {
    return handlePropertyCell(room, playerId, space, dice, roomViews)
  }
  if (space.type === 'tax') return handleTaxCell(room, playerId, space, roomViews)
  if (space.type === 'chance' || space.type === 'community') {
    return handleCardCell(room, playerId, space.type, roomViews)
  }
  if (space.type === 'go_to_jail') return handleGoToJailCell(room, playerId, roomViews)

  return false
}

function handlePropertyCell(room: Room, playerId: string, space: any, dice: [number, number], roomViews: Map<string, RoomView>): boolean {
  const player = room.getPlayer(playerId)!
  const isOwner = player.properties.some((p: any) => Number(p) === Number(space.id))
  if (isOwner) return false

  const owner = room.state.players.find(p => p.id !== playerId && p.properties?.some((prop: any) => Number(prop) === Number(space.id)))
  if (!owner && space.price > 0) {
    room.state.actionPending = 'BUY'
    room.state.selectedSpaceId = space.id
    broadcast(roomViews, room.id, { type: 'ACTION_REQUIRED', title: '🏠 Покупка', message: `Купить ${space.name} за ${space.price}₽?`, icon: '🏠', spaceId: space.id, amount: space.price, isMandatory: false })
    return true
  }

  if (owner) {
    const ownedUtils = owner.properties.filter((id: any) => [12, 28].includes(Number(id))).length
    const ownedRRs = owner.properties.filter((id: any) => [5, 15, 25, 35].includes(Number(id))).length
    const rent = calculateRent(space, owner.houses?.[space.id] || 0, dice[0] + dice[1], ownedUtils, ownedRRs)

    room.state.pendingPayment = { amount: rent, creditorId: owner.id, type: 'rent' }
    room.state.actionPending = 'INFO'
    room.state.selectedSpaceId = space.id // 🔹 Корректный ID для модалки
    const label = (owner.houses?.[space.id] || 0) === 0 ? '(базовая)' : (owner.houses?.[space.id] || 0) === 4 ? '(🏨 отель)' : `(🏠 ${owner.houses?.[space.id]} дома)`
    room.addLog(`💸 ${player.name} должен заплатить ${rent}₽ аренды за ${space.name} ${label}`)
    broadcast(roomViews, room.id, { type: 'ACTION_REQUIRED', title: '💸 Аренда', message: `Аренда ${rent}₽ ${label}`, icon: '💸', spaceId: space.id, amount: rent, isMandatory: true })
    return true
  }
  return false
}

function handleTaxCell(room: Room, playerId: string, space: any, roomViews: Map<string, RoomView>): boolean {
  const tax = space.price || (space.id === 4 ? 200 : 100)
  room.state.pendingPayment = { amount: tax, creditorId: null, type: 'tax' }
  room.state.actionPending = 'INFO'
  room.state.selectedSpaceId = space.id
  room.addLog(`📉 ${room.getPlayer(playerId)?.name} должен заплатить налог ${tax}₽`)
  broadcast(roomViews, room.id, { type: 'ACTION_REQUIRED', title: '📉 Налог', message: `Налог ${tax}₽`, icon: '📉', spaceId: space.id, amount: tax, isMandatory: true })
  return true
}

function handleCardCell(room: Room, playerId: string, cardType: 'chance' | 'community', roomViews: Map<string, RoomView>): boolean {
  // 🔹 handleDrawCard теперь только вытягивает карту и ставит pending, не выполняя эффекты
  const result = handleDrawCard(room, playerId, cardType, roomViews)
  return result?.actionRequired || false
}

// 🔹 Клетка "Иди в тюрьму" — ТЕПЕРЬ ТОЖЕ ЧЕРЕЗ PENDING
function handleGoToJailCell(room: Room, playerId: string, roomViews: Map<string, RoomView>): boolean {
  const player = room.getPlayer(playerId)
  if (!player) return false

  // 🔹 Сохраняем действие, но НЕ перемещаем игрока сразу
  room.state.pendingCard = { text: 'Идите в тюрьму. Не проходите СТАРТ', action: 'go_to_jail', type: 'go_to_jail' }
  room.state.actionPending = 'CARD'
  room.state.selectedSpaceId = player.pos // Чтобы модалка не показывала чужую улицу

  room.addLog(`⚖️ ${player.name} получил предписание: Идите в тюрьму`)
  broadcast(roomViews, room.id, { type: 'ACTION_REQUIRED', title: '🚔 Тюрьма', message: 'Идите в тюрьму. Не проходите СТАРТ', icon: '🚔' })

  return true // Требует нажатия "Далее"
}

export function finalizeTurn(room: Room, playerId: string, keepTurn: boolean, actionRequired: boolean, roomViews: Map<string, RoomView>): void {
  if (actionRequired) return
  if (keepTurn) {
    room.state.actionPending = 'DOUBLE_TURN'
    room.addLog(`🎲 ${room.getPlayer(playerId)?.name} сохраняет ход (дубль)`)
  } else {
    room.finishTurn()
  }
  room.broadcastState()
}