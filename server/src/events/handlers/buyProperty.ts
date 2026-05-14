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
  console.log(`🔍 [PASS] Entering | actionPending: ${room.state.actionPending} | pendingPayment:`, JSON.stringify(room.state.pendingPayment))
  if (!playerId || playerId === 'null') return { error: 'Invalid player ID' }
  const player = room.getPlayer(playerId)
  if (!player) return { error: 'Игрок не найден' }

  console.log(`📜 [PASS] Start | Pending: ${room.state.actionPending} | Payment:`, JSON.stringify(room.state.pendingPayment))

  // 🔹 1️⃣ INFO (Аренда/Налог/Бонус)
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
      // Очищаем только после успешной обработки
      room.state.pendingPayment = null
    } else {
      // 🔑 FALLBACK: если pendingPayment потерялся, просто закрываем действие
      console.warn(`⚠️ [PASS] INFO action but pendingPayment is missing. Auto-resolving.`)
    }

    room.state.actionPending = 'NONE'

    // Обработка дублей
    if (room.state.lastRollWasDouble && player.consecutiveDoubles < 3) {
      room.state.actionPending = 'DOUBLE_TURN'
    } else {
      room.finishTurn()
    }

    broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
    return { success: true }
  }

  // 🔹 2️⃣ CARD
  // 🔹 2️⃣ Обработка КАРТЫ (по кнопке "Далее")
  // 🔹 2️⃣ Обработка КАРТЫ (по кнопке "Далее")
  if (room.state.actionPending === 'CARD') {
    const card = room.state.pendingCard
    const player = room.getPlayer(playerId)!

    // 🔑 Если карта требует оплаты → переходим в режим INFO (кнопка "Пропустить" скроется автоматически)
    if (card && card.action === 'pay') {
      room.state.pendingPayment = { amount: card.amount || 0, creditorId: null, type: 'tax' }
      room.state.actionPending = 'INFO'
      room.addLog(`💳 ${player.name} должен заплатить ${card.amount}₽ по карте`)
      broadcast(roomViews, room.id, {
        type: 'ACTION_REQUIRED',
        title: '💳 Оплата по карте',
        message: card.text,
        icon: '💳',
        amount: card.amount,
        isMandatory: true // 🔑 Ключевое: UI скроет кнопку "Пропустить"
      })
      return { success: true, actionRequired: true }
    }

    // Выполняем остальные эффекты сразу (движение, бонусы, тюрьма и т.д.)
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
        case 'go_to_jail':
          player.pos = 10
          player.isInJail = true
          player.jailTurns = 0
          player.consecutiveDoubles = 0
          room.addLog(`🚔 ${player.name} отправлен в тюрьму по карте!`)
          broadcast(roomViews, room.id, { type: 'GO_TO_JAIL', playerId })
          break
        case 'get_jail_card':
          player.jailCards = (player.jailCards || 0) + 1
          room.addLog(`🎫 ${player.name} получил карту "Выход из тюрьмы"`)
          break
      }
    }

    // Очищаем карту и действие
    room.state.pendingCard = null
    room.state.actionPending = 'NONE'

    // Обработка дублей
    if (room.state.lastRollWasDouble && player.consecutiveDoubles < 3) {
      room.state.actionPending = 'DOUBLE_TURN'
    } else {
      room.finishTurn()
    }

    broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
    return { success: true }
  }

  // 🔹 3️⃣ BUY / DOUBLE_TURN
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