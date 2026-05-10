// server/src/events/handlers/buyProperty.ts
import type { Room } from '../../rooms/Room'
import type { RoomView } from '../../rooms/RoomManager'
import { broadcast, buildSyncPayload } from '../../lib/ws-utils'
import { getSpaceById } from '../../shared/boardConfig'

export function handleBuyProperty(room: Room, playerId: string, spaceId: number, roomViews: Map<string, RoomView>) {
  const space = getSpaceById(spaceId)
  if (!space || (space.type !== 'property' && space.type !== 'railroad')) return { error: 'Нельзя купить эту клетку' }

  const player = room.getPlayer(playerId)
  if (!player) return { error: 'Игрок не найден' }
  if (room.state.currentTurn !== playerId) return { error: 'Не ваш ход' }
  if (room.state.actionPending !== 'BUY') return { error: 'Покупка не предлагается' }
  if (player.properties.includes(spaceId)) return { error: 'Уже куплено' }
  if (player.money < space.price) return { error: 'Недостаточно средств' }

  player.money -= space.price
  player.properties.push(spaceId)
  room.addLog(`🏠 ${player.name} купил ${space.name} за ${space.price}₽`)

  finishTurnOrDouble(room, roomViews)
  broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
  return { success: true }
}

export function handlePassAction(room: Room, playerId: string, roomViews: Map<string, RoomView>) {
  if (room.state.currentTurn !== playerId) return { error: 'Не ваш ход' }
  if (!['BUY', 'CARD', 'INFO'].includes(room.state.actionPending)) {
    return { error: `Нет активных действий (текущее: ${room.state.actionPending})` }
  }

  room.addLog(`⏭ ${room.getPlayer(playerId)?.name} завершил действие`)
  finishTurnOrDouble(room, roomViews)
  broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
  return { success: true }
}

// 🔑 Логика перехода хода: если был дубль → оставляем ход, иначе → передаём
function finishTurnOrDouble(room: Room, roomViews: Map<string, RoomView>) {
  if (room.state.lastRollWasDouble) {
    room.state.actionPending = 'DOUBLE_TURN'
    broadcast(roomViews, room.id, { type: 'DOUBLE_ROLLED', playerId: room.state.currentTurn })
  } else {
    room.finishTurn()
  }
}