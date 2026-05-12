// server/src/lib/rentCalculator.ts
import { getSpaceById } from '../shared/boardConfig'

export function calculateRent(spaceId: number, ownerId: string, players: any[], dice: [number, number]): number {
  const space = getSpaceById(spaceId)
  const owner = players.find(p => p.id === ownerId)

  if (!space || !owner) return 0

  // 🚂 ЖД Вокзалы
  if (space.type === 'railroad') {
    const railroadIds = [5, 15, 25, 35]
    const ownedCount = owner.properties.filter((id: number) => railroadIds.includes(id)).length
    return 25 * Math.pow(2, ownedCount - 1)
  }

  // ⚡ Коммунальные предприятия
  if ([12, 28].includes(spaceId)) {
    const utilIds = [12, 28]
    const ownedCount = owner.properties.filter((id: number) => utilIds.includes(id)).length
    return (dice[0] + dice[1]) * (ownedCount === 2 ? 10 : 4)
  }

  // 🏠 Обычная недвижимость
  const houseCount = owner.houses?.[spaceId] || 0
  if (houseCount === 0) return space.baseRent
  if (houseCount <= 4 && space.rentWithHouse) return space.rentWithHouse[houseCount - 1]
  if (houseCount === 5) return space.rentWithHotel || space.baseRent * 10

  return space.baseRent
}

export function getHouseLabel(owner: any, spaceId: number): string {
  const count = owner.houses?.[spaceId] || 0
  if (count === 0) return ''
  if (count === 5) return '🏨 Отель'
  return `🏠 Дом ${count}/4`
}

export function hasFullColorSet(player: any, spaceId: number): boolean {
  const space = getSpaceById(spaceId)
  if (!space?.color) return false

  return Array.from({ length: 40 }, (_, i) => getSpaceById(i))
    .filter(s => s?.type === 'property' && s?.color === space.color)
    .every(s => player.properties.includes(s.id))
}

export function getColorGroup(spaceId: number): number[] {
  const space = getSpaceById(spaceId)
  if (!space?.color) return []

  return Array.from({ length: 40 }, (_, i) => getSpaceById(i))
    .filter(s => s?.type === 'property' && s?.color === space.color)
    .map(s => s.id)
}