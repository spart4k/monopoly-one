// server/src/events/handlers/rollDice.ts
import type { Room } from '../../rooms/Room'
import type { RoomView } from '../../rooms/RoomManager'
import { broadcast, buildSyncPayload } from '../../lib/ws-utils'
import { getSpaceById } from '../../shared/boardConfig'
import { handleDrawCard } from './cardAction'

export function handleRollDice(room: Room, playerId: string, roomViews: Map<string, RoomView>, targetSpaceId?: number) {
  const player = room.getPlayer(playerId)
  if (!player) return { error: 'Игрок не найден' }

  if (room.state.actionPending !== 'NONE' && room.state.actionPending !== 'DOUBLE_TURN') {
    return { error: `🚫 Сначала завершите действие: ${room.state.actionPending}` }
  }

  if (player.isInJail) {
    return { error: '🚫 Игрок в тюрьме. Используйте действия выхода.' }
  }

  let dice: [number, number] = [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)]
  let finalPos = player.pos

  if (targetSpaceId !== undefined) {
    let steps = (targetSpaceId - player.pos + 40) % 40
    if (steps === 0) steps = 40
    steps = Math.max(2, Math.min(12, steps))
    dice = [Math.floor(steps / 2), steps - Math.floor(steps / 2)]
    finalPos = targetSpaceId
  } else {
    finalPos = (player.pos + dice[0] + dice[1]) % 40
  }

  const oldPos = player.pos
  player.pos = finalPos
  room.state.lastDice = dice

  const isDouble = dice[0] === dice[1]
  const doubleLog = isDouble ? ' (ДУБЛЬ!)' : ''
  room.addLog(`🎲 ${player.name}: ${dice[0]}+${dice[1]}${doubleLog} → ${finalPos}`)

  // Сохраняем флаг дубля для последующих действий (покупка, карты, налоги)
  room.state.lastRollWasDouble = isDouble

  // 💰 Проход через СТАРТ
  if (finalPos < oldPos && finalPos !== 0) {
    player.money += 200
    room.addLog(`💰 ${player.name} получил 200₽ за СТАРТ`)
  }

  const space = getSpaceById(player.pos)
  if (!space) {
    if (!isDouble) room.finishTurn()
    else room.state.actionPending = 'DOUBLE_TURN'
    broadcast(roomViews, room.id, { type: 'PLAYER_MOVED', playerId, from: oldPos, to: player.pos, dice })
    broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
    return { success: true }
  }

  let actionRequired = false

  // 🏠 Недвижимость
  if (space.type === 'property' || space.type === 'railroad') {
    const owner = room.state.players.find(p => p.properties?.includes(space.id))
    if (!owner) {
      room.state.actionPending = 'BUY'
      actionRequired = true
      broadcast(roomViews, room.id, { type: 'OFFER_BUY', playerId, spaceId: space.id, price: space.price, name: space.name })
    } else if (owner.id !== playerId) {
      let rent = 0
      if (space.type === 'railroad') {
        const rrCount = owner.properties.filter(id => [5,15,25,35].includes(id)).length
        rent = 25 * Math.pow(2, rrCount - 1)
      } else if ([12,28].includes(space.id)) {
        const utilCount = owner.properties.filter(id => [12,28].includes(id)).length
        rent = (dice[0]+dice[1]) * (utilCount === 2 ? 10 : 4)
      } else {
        rent = space.baseRent
      }
      if (rent > 0) {
        const paid = Math.min(player.money, rent)
        owner.money += paid
        player.money -= paid
        room.addLog(`💸 ${player.name} заплатил ${paid}₽ аренды`)
        room.state.actionPending = 'INFO'
        actionRequired = true
        broadcast(roomViews, room.id, { type: 'ACTION_REQUIRED', title: '💸 Аренда', message: `Вы заплатили ${paid}₽`, icon: '💸' })
      }
    }
  }
  // 📉 Налоги
  else if (space.type === 'tax') {
    const tax = space.id === 4 ? 200 : 100
    player.money -= tax
    room.addLog(`📉 ${player.name} заплатил налог ${tax}₽`)
    room.state.actionPending = 'INFO'
    actionRequired = true
    broadcast(roomViews, room.id, { type: 'ACTION_REQUIRED', title: '📉 Налог', message: `Налог ${tax}₽ списан`, icon: '📉' })
  }
  // 🃏 Карты
  else if (space.type === 'chance' || space.type === 'community') {
    return handleDrawCard(room, playerId, space.type, roomViews)
  }
  // 🚔 Тюрьма
  else if (space.type === 'go_to_jail') {
    player.pos = 10
    player.isInJail = true
    player.jailTurns = 0
    room.addLog(`🚔 ${player.name} отправлен в тюрьму!`)
    broadcast(roomViews, room.id, { type: 'GO_TO_JAIL', playerId })
    room.finishTurn()
    broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
    return { success: true }
  }

  // 🔄 Обработка дублей (если нет обязательного действия)
  if (!actionRequired) {
    if (isDouble) {
      player.consecutiveDoubles++
      if (player.consecutiveDoubles >= 3) {
        player.pos = 10; player.isInJail = true; player.jailTurns = 0; player.consecutiveDoubles = 0
        room.addLog(`🚔 ${player.name} выбросил 3 дубля подряд → Тюрьма!`)
        broadcast(roomViews, room.id, { type: 'GO_TO_JAIL', playerId })
        room.finishTurn()
      } else {
        room.state.actionPending = 'DOUBLE_TURN'
        broadcast(roomViews, room.id, { type: 'DOUBLE_ROLLED', playerId })
      }
    } else {
      player.consecutiveDoubles = 0
      room.finishTurn()
    }
  }
  // Если actionRequired === true, ход НЕ передается. Флаг lastRollWasDouble сохранён.

  broadcast(roomViews, room.id, { type: 'PLAYER_MOVED', playerId, from: oldPos, to: player.pos, dice })
  if (!actionRequired) {
    broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
  }

  return { success: true, actionRequired }
}