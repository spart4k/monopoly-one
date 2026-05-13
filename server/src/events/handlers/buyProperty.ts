// server/src/events/handlers/buyProperty.ts
import type { Room } from '../../rooms/Room'
import type { RoomView } from '../../rooms/RoomManager'
import { broadcast, buildSyncPayload } from '../../lib/ws-utils'
import { getSpaceById } from '../../shared/boardConfig'

function logState(room: Room, action: string, details: string = '') {
  const p = room.getPlayer(room.state.currentTurn)
  console.log(`📜 [STATE] ${action} | Room: ${room.id} | Pending: ${room.state.actionPending} | Double: ${room.state.lastRollWasDouble} | Consecutive: ${p?.consecutiveDoubles || 0} | ${details}`)
}

export function handleBuyProperty(
  room: Room,
  playerId: string,
  spaceId: number,
  roomViews: Map<string, RoomView>
) {
  logState(room, 'BUY_PROPERTY_START')
  const player = room.getPlayer(playerId)
  if (!player) return { error: 'Игрок не найден' }

  if (room.state.actionPending !== 'BUY') {
    return { error: 'Ожидается действие покупки или оно уже завершено' }
  }
  if (playerId !== room.state.currentTurn) {
    return { error: 'Действие может выполнить только текущий игрок' }
  }

  const space = getSpaceById(spaceId)
  if (!space || space.price === undefined) return { error: 'Клетка не найдена' }
  if (player.money < space.price) return { error: 'Недостаточно средств' }

  // Применяем покупку
  player.money -= space.price
  if (!player.properties.includes(spaceId)) {
    player.properties.push(spaceId)
  }
  room.addLog(`🏠 ${player.name} купил ${space.name} за ${space.price}₽`)
  room.state.actionPending = 'NONE'

  // 🔑 Если был дубль → сохраняем ход, иначе → передаём
  if (room.state.lastRollWasDouble && player.consecutiveDoubles < 3) {
    room.state.actionPending = 'DOUBLE_TURN'
    logState(room, 'BUY_SUCCESS -> KEEP_TURN (DOUBLE)')
    broadcast(roomViews, room.id, { type: 'DOUBLE_ROLLED', playerId })
  } else {
    logState(room, 'BUY_SUCCESS -> PASS_TURN')
    room.finishTurn()
  }

  broadcast(roomViews, room.id, {
    type: 'SYNC_STATE',
    payload: buildSyncPayload(room.state)
  })
  return { success: true }
}

export function handlePassAction(room: Room, playerId: string, roomViews: Map<string, RoomView>) {
  // 🔑 Валидация: отклоняем "null"
  if (!playerId || playerId === 'null') {
    return { error: 'Invalid player ID' }
  }

  const player = room.getPlayer(playerId)
  if (!player) return { error: 'Игрок не найден' }

  console.log(`📜 [PASS] Start | Pending: ${room.state.actionPending} | Player: ${player.name}`)

  // 🔹 1️⃣ Обработка ОПЛАТЫ / БОНУСА (INFO)
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
          room.addLog(`⚠️ У ${player.name} не хватает денег на ${pay.amount}₽. Долг сохранён.`)
        }
      } else if (pay.type === 'bonus') {
        player.money += pay.amount
        room.addLog(`✅ ${player.name} получил бонус ${pay.amount}₽`)
      }
      // Очищаем только после обработки
      room.state.pendingPayment = null
    }

    room.state.actionPending = 'NONE'

    // Обработка дублей
    if (room.state.lastRollWasDouble && player.consecutiveDoubles < 3) {
      room.state.actionPending = 'DOUBLE_TURN'
      console.log(`📜 [PASS] INFO -> KEEP_TURN (DOUBLE)`)
    } else {
      room.finishTurn()
      console.log(`📜 [PASS] INFO -> FINISH_TURN`)
    }

    broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
    return { success: true }
  }

  // 🔹 2️⃣ Закрытие КАРТ (CARD)
  if (room.state.actionPending === 'CARD') {
    room.state.actionPending = 'NONE'
    if (room.state.lastRollWasDouble && player.consecutiveDoubles < 3) {
      room.state.actionPending = 'DOUBLE_TURN'
    } else {
      room.finishTurn()
    }
    broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
    return { success: true }
  }

  // 🔹 3️⃣ Закрытие ПОКУПКИ / ДУБЛЯ
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

  console.log(`📜 [PASS] No active action to resolve. Pending: ${room.state.actionPending}`)
  return { error: 'Нет активных действий' }
}