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

export function handlePassAction(
  room: Room,
  playerId: string,
  roomViews: Map<string, RoomView>
) {
  logState(room, 'PASS_ACTION_START')
  const player = room.getPlayer(playerId)
  if (!player) return { error: 'Игрок не найден' }

  const keepTurn = room.state.lastRollWasDouble && player.consecutiveDoubles < 3

  // 1️⃣ Закрытие модалки КАРТЫ
  if (room.state.actionPending === 'CARD') {
    room.state.actionPending = 'NONE'
    const space = getSpaceById(player.pos)

    if (space && (space.type === 'property' || space.type === 'railroad')) {
      const owner = room.state.players.find(p => p.properties?.includes(space.id))
      if (!owner) {
        room.state.actionPending = 'BUY'
        logState(room, 'CARD_RESOLVED -> BUY_OFFER')
        broadcast(roomViews, room.id, {
          type: 'OFFER_BUY',
          playerId,
          spaceId: space.id,
          price: space.price,
          name: space.name
        })
        broadcast(roomViews, room.id, {
          type: 'SYNC_STATE',
          payload: buildSyncPayload(room.state)
        })
        return { success: true, actionRequired: true }
      } else if (owner.id !== playerId) {
        let rent = space.baseRent
        const paid = Math.min(player.money, rent)
        owner.money += paid
        player.money -= paid
        room.addLog(`💸 ${player.name} заплатил ${paid}₽ аренды ${space.name}`)
        room.state.actionPending = 'INFO'
        logState(room, 'CARD_RESOLVED -> RENT_INFO')
        broadcast(roomViews, room.id, {
          type: 'ACTION_REQUIRED',
          title: '💸 Аренда',
          message: `Оплачено ${paid}₽`,
          icon: '💸'
        })
        broadcast(roomViews, room.id, {
          type: 'SYNC_STATE',
          payload: buildSyncPayload(room.state)
        })
        return { success: true, actionRequired: true }
      }
    }

    if (keepTurn) {
      room.state.actionPending = 'DOUBLE_TURN'
      room.addLog(`🎲 ${player.name} сохраняет ход (дубль)`)
    } else {
      logState(room, 'CARD_RESOLVED -> PASS_TURN')
      room.finishTurn()
    }
    broadcast(roomViews, room.id, {
      type: 'SYNC_STATE',
      payload: buildSyncPayload(room.state)
    })
    return { success: true }
  }

  // 2️⃣ Закрытие модалок ПОКУПКИ / ИНФО / ДУБЛЯ
  if (['BUY', 'INFO', 'DOUBLE_TURN'].includes(room.state.actionPending)) {
    room.state.actionPending = 'NONE'

    if (keepTurn) {
      room.state.actionPending = 'DOUBLE_TURN'
      logState(room, 'ACTION_RESOLVED -> KEEP_TURN (DOUBLE)')
    } else {
      room.finishTurn()
      logState(room, 'ACTION_RESOLVED -> FINISH_TURN')
    }

    broadcast(roomViews, room.id, {
      type: 'SYNC_STATE',
      payload: buildSyncPayload(room.state)
    })
    return { success: true }
  }

  logState(room, 'NO_ACTION')
  return { error: 'Нет активных действий' }
}