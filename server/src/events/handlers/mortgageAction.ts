// server/src/events/handlers/mortgageAction.ts
import type { Room } from '../../rooms/Room'
import type { RoomView } from '../../rooms/RoomManager'
import { broadcast, buildSyncPayload } from '../../lib/ws-utils'
import { getSpaceById } from '../../shared/boardConfig'

export function handleMortgage(room: Room, playerId: string, spaceId: number, roomViews: Map<string, RoomView>) {
  const player = room.getPlayer(playerId)
  if (!player) return { error: 'Игрок не найден' }
  if (room.state.currentTurn !== playerId) return { error: 'Не ваш ход' }
  if (!player.properties.includes(spaceId)) return { error: 'У вас нет этой улицы' }

  // 🔑 ФИКС: защита от undefined
  player.mortgaged = player.mortgaged || []
  if (player.mortgaged.includes(spaceId)) return { error: 'Улица уже заложена' }

  const space = getSpaceById(spaceId)
  if (!space || !space.price) return { error: 'Клетка не найдена' }

  // Нельзя заложить, если есть дома
  const houseCount = player.houses?.[spaceId] || 0
  if (houseCount > 0) return { error: `Сначала продайте ${houseCount} зд. на этой улице` }

  // Проверка монополии: если есть дома на других улицах этого цвета — нельзя
  const colorGroups: Record<string, number[]> = {
    'bg-brown-500': [1,3], 'bg-cyan-400': [6,8,9], 'bg-pink-500': [11,13,14],
    'bg-orange-500': [16,18,19], 'bg-red-500': [21,23,24], 'bg-yellow-500': [26,27,29],
    'bg-green-700': [31,32,34], 'bg-blue-900': [37,39]
  }
  const group = colorGroups[space.color]
  if (group) {
    const hasHousesElsewhere = group.some(id => id !== spaceId && (player.houses?.[id] || 0) > 0)
    if (hasHousesElsewhere) return { error: 'Сначала продайте дома на других улицах этого цвета' }
  }

  // Применяем залог
  const mortgageValue = Math.floor(space.price / 2) // 🔑 50% от цены
  player.money += mortgageValue
  player.mortgaged.push(spaceId)
  room.addLog(`🔒 ${player.name} заложил ${space.name} за ${mortgageValue}₽`)
  broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
  return { success: true }
}

export function handleUnmortgage(room: Room, playerId: string, spaceId: number, roomViews: Map<string, RoomView>) {
  const player = room.getPlayer(playerId)
  if (!player) return { error: 'Игрок не найден' }
  if (room.state.currentTurn !== playerId) return { error: 'Не ваш ход' }

  // 🔑 ФИКС: защита от undefined
  player.mortgaged = player.mortgaged || []
  if (!player.mortgaged.includes(spaceId)) return { error: 'Улица не заложена' }

  const space = getSpaceById(spaceId)
  if (!space || !space.price) return { error: 'Клетка не найдена' }

  // Выкуп = залог + 10%
  const half = Math.floor(space.price / 2)
  const unmortgageCost = Math.ceil(half * 1.1) // 🔑 110% от стоимости залога
  if (player.money < unmortgageCost) return { error: `Нужно ${unmortgageCost}₽ для выкупа` }
  player.money -= unmortgageCost
  player.mortgaged = player.mortgaged.filter(id => id !== spaceId)

  room.addLog(`🔓 ${player.name} выкупил ${space.name} за ${unmortgageCost}₽`)
  broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
  return { success: true }
}