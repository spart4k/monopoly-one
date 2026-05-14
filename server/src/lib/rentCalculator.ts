// server/src/lib/rentCalculator.ts
import { getSpaceById } from '../shared/boardConfig'
import type { Player } from '../rooms/Room'

export function calculateRent(
  spaceId: number,
  ownerId: string,
  players: Player[],
  dice: [number, number]
): number {
  const space = getSpaceById(spaceId)
  const owner = players.find(p => p.id === ownerId)
  if (!space || !owner) return 0

  // 🔹 Если улица заложена → аренда 0
  if (space.type === 'property' && owner.mortgaged?.includes(spaceId)) return 0

  // 🔹 ЖД Вокзалы: 25, 50, 100, 200
  if (space.type === 'railroad') {
    const railroads = owner.properties.filter(id => {
      const s = getSpaceById(id)
      return s?.type === 'railroad'
    }).length
    const rents = [25, 50, 100, 200]
    return rents[Math.min(railroads, 4) - 1] || 25
  }

  // 🔹 Коммуналки: ×4 (1 пр-тие) или ×10 (2 пр-тия)
  if (space.type === 'utility') {
    const utilities = owner.properties.filter(id => {
      const s = getSpaceById(id)
      return s?.type === 'utility'
    }).length
    const diceSum = dice[0] + dice[1]
    return utilities >= 2 ? diceSum * 10 : diceSum * 4
  }

  // 🔹 Обычные улицы
  if (space.type === 'property') {
    const houses = owner.houses?.[spaceId] || 0

    // 🏨 Отель
    if (houses === 5) return space.rentWithHotel || space.baseRent * 10

    // 🏠 Дома 1-4
    if (houses > 0 && space.rentWithHouse) {
      return space.rentWithHouse[houses - 1] || space.baseRent
    }

    // 🏁 Без домов (базовая аренда)
    return space.baseRent || 10
  }

  return 0
}

export function getHouseLabel(owner: Player, spaceId: number): string {
  const houses = owner.houses?.[spaceId] || 0
  if (houses === 0) return '(базовая)'
  if (houses === 5) return '(🏨 Отель)'
  const suffix = houses === 1 ? '' : houses < 5 ? 'а' : 'ов'
  return `(🏠 ${houses} дом${suffix})`
}