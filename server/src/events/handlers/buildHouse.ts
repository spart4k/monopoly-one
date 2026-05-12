// server/src/events/handlers/buildHouse.ts
import type { Room } from '../../rooms/Room'
import type { RoomView } from '../../rooms/RoomManager'
import { broadcast, buildSyncPayload } from '../../lib/ws-utils'
import { getSpaceById } from '../../shared/boardConfig'

const COLOR_GROUPS: Record<string, number[]> = {
  'bg-brown-500': [1, 3],
  'bg-cyan-400': [6, 8, 9],
  'bg-pink-500': [11, 13, 14],
  'bg-orange-500': [16, 18, 19],
  'bg-red-500': [21, 23, 24],
  'bg-yellow-500': [26, 27, 29],
  'bg-green-700': [31, 32, 34],
  'bg-blue-900': [37, 39]
}

export function handleBuyHouse(room: Room, playerId: string, spaceId: number, roomViews: Map<string, RoomView>) {
  const player = room.getPlayer(playerId)
  if (!player) return { error: 'Player not found' }
  if (player.mortgaged?.includes(spaceId)) {
    return { error: '🔒 Сначала выкупите улицу из залога' }
  }
  if (room.state.currentTurn !== playerId) return { error: 'Не ваш ход' }
  if (player.isInJail) return { error: '🔒 Нельзя покупать дома в тюрьме' } // ✅

  const space = getSpaceById(spaceId)
  if (!space || space.type !== 'property') return { error: 'Нельзя построить здесь' }
  if (!player.properties.includes(spaceId)) return { error: 'У вас нет этой улицы' }

  const groupKey = space.color
  const groupIds = COLOR_GROUPS[groupKey] || []
  if (!groupIds.every(id => player.properties.includes(id))) {
    return { error: '🏗️ Нужно владеть всеми улицами цвета' }
  }

  const currentCount = player.houses[spaceId] || 0
  if (currentCount >= 5) return { error: '🏨 Максимум достигнут (отель)' }

  const minInGroup = Math.min(...groupIds.map(id => player.houses[id] || 0))
  if (currentCount > minInGroup) return { error: '⚖️ Сначала застройте другие улицы этого цвета' }

  const cost = space.houseCost || 100
  if (player.money < cost) return { error: '💸 Недостаточно средств' }

  player.money -= cost
  player.houses[spaceId] = currentCount + 1

  const label = player.houses[spaceId] === 5 ? '🏨 Отель' : `🏠 Дом ${player.houses[spaceId]}/4`
  room.addLog(`🔨 ${player.name} купил ${label} на ${space.name} за ${cost}₽`)

  broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
  return { success: true }
}

export function handleSellHouse(room: Room, playerId: string, spaceId: number, roomViews: Map<string, RoomView>) {
  const player = room.getPlayer(playerId)
  if (!player) return { error: 'Player not found' }
  if (room.state.currentTurn !== playerId) return { error: 'Не ваш ход' }
  if (player.isInJail) return { error: '🔒 Нельзя продавать дома в тюрьме' } // ✅

  const space = getSpaceById(spaceId)
  if (!space || space.type !== 'property') return { error: 'Нельзя продать' }
  if (!player.properties.includes(spaceId)) return { error: 'У вас нет этой улицы' }

  const currentCount = player.houses[spaceId] || 0
  if (currentCount === 0) return { error: 'Нет домов для продажи' }

  const groupKey = space.color
  const groupIds = COLOR_GROUPS[groupKey] || []
  const maxInGroup = Math.max(...groupIds.map(id => player.houses[id] || 0))
  if (currentCount < maxInGroup) return { error: '⚖️ Сначала продайте дома на других улицах' }

  const refund = Math.floor((space.houseCost || 100) / 2)
  player.money += refund
  player.houses[spaceId] = currentCount - 1

  room.addLog(`💰 ${player.name} продал здание на ${space.name} за ${refund}₽`)
  broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
  return { success: true }
}