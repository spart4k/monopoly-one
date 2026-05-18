// server/src/events/buyProperty.ts
import type { Room } from '../../rooms/Room'
import type { RoomView } from '../../rooms/RoomManager'
import { broadcast, buildSyncPayload } from '../../lib/ws-utils'
import { getSpaceById } from '../../shared/boardConfig'
import { processCellEffects } from './rollDice/cell'

// 🔹 Вспомогательная функция: корректно завершает действие, сохраняя ход при дубле
function completeActionTurn(room: Room, playerId: string, roomViews: Map<string, RoomView>) {
  const player = room.getPlayer(playerId)
  if (!player) return

  // Если был дубль (consecutiveDoubles > 0) и не 3 подряд → игрок ходит снова
  if (player.consecutiveDoubles > 0 && player.consecutiveDoubles < 3) {
    room.state.actionPending = 'DOUBLE_TURN'
    room.addLog(`🎲 ${player.name} сохраняет ход (дубль)`)
  } else {
    room.finishTurn()
  }
  broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
}

export function handleBuyProperty(room: Room, playerId: string, spaceId: number, roomViews: Map<string, RoomView>) {
  const player = room.getPlayer(playerId)
  if (!player) return { error: 'Игрок не найден' }
  if (room.state.actionPending !== 'BUY') return { error: 'Ожидается действие покупки' }
  if (playerId !== room.state.currentTurn) return { error: 'Не ваш ход' }

  // 🔹 Защита: нельзя купить свою улицу
  const alreadyOwned = player.properties.some((prop: any) => Number(prop) === Number(spaceId))
  if (alreadyOwned) return { error: 'Вы уже владеете этой улицей' }

  const space = getSpaceById(spaceId)
  if (!space || space.price === undefined) return { error: 'Клетка не найдена' }
  if (player.money < space.price) return { error: 'Недостаточно средств' }

  player.money -= space.price
  player.properties.push(spaceId)
  room.addLog(`🏠 ${player.name} купил ${space.name} за ${space.price}₽`)

  room.state.actionPending = 'NONE'
  room.state.selectedSpaceId = null

  // 🔹 Завершаем действие (сохранит ход, если был дубль)
  completeActionTurn(room, playerId, roomViews)
  return { success: true }
}

export function handlePassAction(room: Room, playerId: string, roomViews: Map<string, RoomView>) {
  const player = room.getPlayer(playerId)
  if (!player) return { error: 'Игрок не найден' }

  // 🔹 1. Оплата аренды/налога
  if (room.state.actionPending === 'INFO') {
    const pay = room.state.pendingPayment
    if (pay) {
      if (player.money >= pay.amount) {
        player.money -= pay.amount
        if (pay.creditorId) {
          const creditor = room.getPlayer(pay.creditorId)
          if (creditor) creditor.money += pay.amount
        }
        room.addLog(`✅ ${player.name} оплатил ${pay.amount}₽`)
      } else {
        room.addLog(`⚠️ ${player.name} не может оплатить ${pay.amount}₽. Требуется банкротство.`)
      }
      room.state.pendingPayment = null
    }
    room.state.actionPending = 'NONE'

    completeActionTurn(room, playerId, roomViews)
    return { success: true }
  }

  // 🔹 2. Карты Шанс/Казна + Тюрьма
  // 🔹 2. Карты Шанс/Казна + Тюрьма
  if (room.state.actionPending === 'CARD') {
    const card = room.state.pendingCard
    const player = room.getPlayer(playerId)!
    let movedToNewCell = false

    if (card) {
      switch (card.action) {
        case 'go_to_jail':
          player.pos = 10; player.isInJail = true; player.jailTurns = 0; player.consecutiveDoubles = 0
          room.addLog(`🚔 ${player.name} перемещён в тюрьму`)
          broadcast(roomViews, room.id, { type: 'GO_TO_JAIL', playerId })
          // По ТЗ: ход ВСЕГДА переходит после карты тюрьмы
          room.state.pendingCard = null; room.state.actionPending = 'NONE'; room.state.selectedSpaceId = null
          room.finishTurn()
          broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
          return { success: true }
        case 'move':
          if (player.pos > (card.targetSpaceId || 0)) { player.money += 200; room.addLog(`💰 ${player.name} получил 200₽ за СТАРТ`) }
          player.pos = card.targetSpaceId || 0
          movedToNewCell = true
          break
        case 'move_back':
          player.pos = (player.pos - (card.steps || 0) + 40) % 40
          movedToNewCell = true
          room.addLog(`🔙 ${player.name} вернулся на ${card.steps} клетки назад`)
          break
        case 'receive': player.money += card.amount || 0; room.addLog(`🎁 ${player.name} получил ${card.amount}₽`); break
        case 'pay': player.money -= card.amount || 0; room.addLog(`💸 ${player.name} заплатил ${card.amount}₽`); break
        case 'get_jail_card': player.jailCards = (player.jailCards || 0) + 1; room.addLog(`🎫 ${player.name} получил карту`); break
      }
    }

    room.state.pendingCard = null
    room.state.selectedSpaceId = null

    // 🔹 КРИТИЧНО: Если карта переместила фишку — ПРОВЕРЯЕМ новую клетку!
    if (movedToNewCell) {
      const dice = room.state.lastDice || [1, 1]
      const actionRequired = processCellEffects(room, playerId, player.pos, dice, roomViews)
      if (actionRequired) {
        return { success: true } // Ждём действия на новой клетке (налог, аренда, другая карта)
      }
    }

    // Если новая клетка свободная или движение не было — завершаем ход
    room.state.actionPending = 'NONE'
    room.finishTurn()
    broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
    return { success: true }
  }

  // 🔹 3. Отказ от покупки / пропуск
  if (['BUY', 'DOUBLE_TURN'].includes(room.state.actionPending)) {
    room.state.actionPending = 'NONE'
    room.state.selectedSpaceId = null

    completeActionTurn(room, playerId, roomViews)
    return { success: true }
  }

  return { error: 'Нет активных действий' }
}

export function handleBankruptcy(room: Room, playerId: string, roomViews: Map<string, RoomView>) {
  const player = room.getPlayer(playerId)
  if (!player) return { error: 'Игрок не найден' }
  if (player.isBankrupt) return { error: 'Игрок уже банкрот' }

  room.declareBankrupt(playerId, roomViews)
  return { success: true }
}