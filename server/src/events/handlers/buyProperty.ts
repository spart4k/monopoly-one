import type { Room } from '../../rooms/Room'
import type { RoomView } from '../../rooms/RoomManager'
import { broadcast, buildSyncPayload } from '../../lib/ws-utils'
import { getSpaceById } from '../../shared/boardConfig'

export function handleBuyProperty(room: Room, playerId: string, spaceId: number, roomViews: Map<string, RoomView>) {
  const player = room.getPlayer(playerId)
  if (!player) return { error: 'Игрок не найден' }
  if (room.state.actionPending !== 'BUY') return { error: 'Ожидается действие покупки' }
  if (playerId !== room.state.currentTurn) return { error: 'Не ваш ход' }

  const space = getSpaceById(spaceId)
  if (!space || space.price === undefined) return { error: 'Клетка не найдена' }
  if (player.money < space.price) return { error: 'Недостаточно средств' }

  player.money -= space.price
  if (!player.properties.includes(spaceId)) player.properties.push(spaceId)
  room.addLog(`🏠 ${player.name} купил ${space.name} за ${space.price}₽`)
  room.state.actionPending = 'NONE'

  if (room.state.lastRollWasDouble && player.consecutiveDoubles < 3) {
    room.state.actionPending = 'DOUBLE_TURN'
  } else {
    room.finishTurn()
  }

  broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
  return { success: true }
}

export function handlePassAction(room: Room, playerId: string, roomViews: Map<string, RoomView>) {
  if (!playerId || playerId === 'null') return { error: 'Invalid player ID' }
  const player = room.getPlayer(playerId)
  if (!player) return { error: 'Игрок не найден' }

  if (room.state.actionPending === 'INFO') {
    const pay = room.state.pendingPayment
    if (pay && pay.amount !== undefined) {
      if (pay.type === 'rent' || pay.type === 'tax') {
        if (player.money >= pay.amount) {
          player.money -= pay.amount
          if (pay.creditorId) {
            const creditor = room.getPlayer(pay.creditorId)
            if (creditor) creditor.money += pay.amount
          }
          room.addLog(`✅ ${player.name} оплатил ${pay.amount}₽`)
        } else {
          room.addLog(`⚠️ У ${player.name} недостаточно средств для оплаты ${pay.amount}₽. Долг сохранён.`)
        }
      } else if (pay.type === 'bonus') {
        player.money += pay.amount
        room.addLog(`✅ ${player.name} получил бонус ${pay.amount}₽`)
      }
      room.state.pendingPayment = null
    }
    room.state.actionPending = 'NONE'
    if (room.state.lastRollWasDouble && player.consecutiveDoubles < 3) {
      room.state.actionPending = 'DOUBLE_TURN'
    } else {
      room.finishTurn()
    }
    broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
    return { success: true }
  }

  if (room.state.actionPending === 'CARD') {
    const card = room.state.pendingCard
    if (card) {
      switch (card.action) {
        case 'move':
          if (player.pos > (card.targetSpaceId || 0)) {
            player.money += 200
            room.addLog(`💰 ${player.name} получил 200₽ за СТАРТ (по карте)`)
          }
          player.pos = card.targetSpaceId || 0
          break
        case 'move_back':
          player.pos = (player.pos - (card.steps || 0) + 40) % 40
          room.addLog(`🔙 ${player.name} вернулся на ${card.steps} клетки назад`)
          break
        case 'receive':
          player.money += card.amount || 0
          room.addLog(`🎁 ${player.name} получил ${card.amount}₽`)
          break
        case 'pay':
          player.money -= card.amount || 0
          room.addLog(`💸 ${player.name} заплатил ${card.amount}₽ по карте`)
          break
        case 'go_to_jail':
          player.pos = 10; player.isInJail = true; player.jailTurns = 0; player.consecutiveDoubles = 0
          room.addLog(`🚔 ${player.name} отправлен в тюрьму по карте!`)
          broadcast(roomViews, room.id, { type: 'GO_TO_JAIL', playerId })
          break
        case 'get_jail_card':
          player.jailCards = (player.jailCards || 0) + 1
          room.addLog(`🎫 ${player.name} получил карту "Выход из тюрьмы"`)
          break
      }
    }
    room.state.pendingCard = null
    room.state.actionPending = 'NONE'
    if (room.state.lastRollWasDouble && player.consecutiveDoubles < 3) {
      room.state.actionPending = 'DOUBLE_TURN'
    } else {
      room.finishTurn()
    }
    broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
    return { success: true }
  }

  if (['BUY', 'DOUBLE_TURN'].includes(room.state.actionPending)) {
    room.state.actionPending = 'NONE'
    if (room.state.lastRollWasDouble && player.consecutiveDoubles < 3) {
      room.state.actionPending = 'DOUBLE_TURN'
    } else {
      room.finishTurn()
    }
    broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
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