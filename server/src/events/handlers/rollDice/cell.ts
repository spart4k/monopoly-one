// server/src/events/handlers/rollDice/cell.ts
import type { Room } from '../../../rooms/Room'
import type { RoomView } from '../../../rooms/RoomManager'
import { broadcast, buildSyncPayload } from '../../../lib/ws-utils'
import { getSpaceById } from '../../../shared/boardConfig'
import { handleDrawCard } from '../cardAction'
import { calculateRent, getHouseLabel } from '../../../lib/rentCalculator'

/**
 * Обрабатывает эффекты при попадании на ячейку
 * @returns true если требуется действие игрока (покупка/аренда/карта)
 */
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

function handlePropertyCell(
  room: Room,
  playerId: string,
  space: any,
  dice: [number, number],
  roomViews: Map<string, RoomView>
): boolean {
  const player = room.getPlayer(playerId)!
  const owner = room.state.players.find(p => p.properties?.includes(space.id))

  // 🆕 Свободная ячейка → предложение купить
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
  }

  // 👤 Чужая собственность → оплата аренды
  if (owner.id !== playerId) {
    const rent = calculateRent(space.id, owner.id, room.state.players, dice)
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

  return false
}

function handleTaxCell(
  room: Room,
  playerId: string,
  space: any,
  roomViews: Map<string, RoomView>
): boolean {
  const player = room.getPlayer(playerId)!
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

function handleCardCell(
  room: Room,
  playerId: string,
  cardType: string,
  roomViews: Map<string, RoomView>
): boolean {
  const result = handleDrawCard(room, playerId, cardType, roomViews)
  return result?.actionRequired || false
}

function handleGoToJailCell(
  room: Room,
  playerId: string,
  roomViews: Map<string, RoomView>
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

/**
 * Завершает ход: передаёт следующему игроку или сохраняет при дубле
 */
export function finalizeTurn(
  room: Room,
  playerId: string,
  keepTurn: boolean,
  actionRequired: boolean,
  roomViews: Map<string, RoomView>
): void {
  // Если висит действие — ждём ответа игрока
  if (actionRequired) return

  if (keepTurn) {
    room.state.actionPending = 'DOUBLE_TURN'
    room.addLog(`🎲 ${room.getPlayer(playerId)?.name} сохраняет ход (дубль)`)
  } else {
    room.finishTurn()
  }
}