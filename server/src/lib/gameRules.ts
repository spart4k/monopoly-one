// server/src/lib/gameRules.ts
import type { ISpaceData } from '../shared/boardConfig'

export interface IPlayer {
  id: string
  money: number
  properties: number[]
  houses: Record<number, number>
  isBankrupt: boolean
  consecutiveDoubles: number
}

export interface IPaymentRequest {
  amount: number
  creditorId: string | null
  type: 'rent' | 'tax' | 'bonus' | 'card'
}

/** 🔹 Расчёт аренды */
export function calculateRent(
  space: ISpaceData,
  houses: number,
  diceSum: number,
  ownedUtilities: number,
  ownedRailroads: number
): number {
  if (space.type === 'utility') {
    return (ownedUtilities === 2 ? 10 : 4) * diceSum
  }
  if (space.type === 'railroad') {
    return 25 * Math.pow(2, ownedRailroads - 1)
  }
  if (space.type === 'property') {
    if (houses === 0) return space.baseRent
    if (houses === 4) return space.rentWithHotel
    return space.rentWithHouse[houses - 1] || 0
  }
  return 0
}

/** 🔹 Списание/зачисление денег */
export function processPayment(
  payer: IPlayer,
  request: IPaymentRequest,
  creditor?: IPlayer
): boolean {
  if (payer.money < request.amount) return false
  payer.money -= request.amount
  if (creditor) creditor.money += request.amount
  return true
}

/** 🔹 Поиск следующего активного игрока */
export function getNextPlayerIndex(players: IPlayer[], startIndex: number): number {
  const len = players.length
  let idx = (startIndex + 1) % len
  let attempts = 0
  while (attempts < len && players[idx]?.isBankrupt) {
    idx = (idx + 1) % len
    attempts++
  }
  return idx
}

/** 🔹 Бонус за проход СТАРТ */
export function calculatePassGoBonus(oldPos: number, newPos: number): number {
  return oldPos > newPos ? 200 : 0
}