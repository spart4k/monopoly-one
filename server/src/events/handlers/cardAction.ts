// server/src/events/handlers/cardAction.ts
import type { Room } from '../../rooms/Room'
import type { RoomView } from '../../rooms/RoomManager'
import { broadcast } from '../../lib/ws-utils'
import { CARDS, type Card } from '../../shared/boardConfig'
import { processCellEffects, finalizeTurn } from './rollDice/cell'

const CARD_DECKS = {
  chance: CARDS.chance,
  community: CARDS.community
}

export function handleDrawCard(
  room: Room,
  playerId: string,
  cardType: string,
  roomViews: Map<string, RoomView>
) {
  const player = room.getPlayer(playerId)
  if (!player) return { error: 'Игрок не найден' }

  const deck = CARD_DECKS[cardType as keyof typeof CARD_DECKS] || CARD_DECKS.chance
  const card: Card = deck[Math.floor(Math.random() * deck.length)]

  room.addLog(`🃏 ${player.name}: "${card.text}"`)

  // 🔹 Обработка действий карты
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
      // 🔹 ТОЖЕ отложенный переход (как с клетки)
      player.pendingJail = true
      room.addLog(`🃏 ${player.name} вытянул карту "Иди в тюрьму" (переместится после хода следующего)`)
      // Не вызываем broadcast GO_TO_JAIL сразу — это сделает processPendingJail
      break
    case 'get_jail_card':
      player.jailCards = (player.jailCards || 0) + 1
      room.addLog(`🎫 ${player.name} получил карту "Выход из тюрьмы"`)
      break
  }

  // 🔑 КРИТИЧНО: После перемещения проверяем эффекты новой клетки!
  if (card.action === 'move' || card.action === 'move_back') {
    room.state.actionPending = 'NONE'
    const actionRequired = processCellEffects(room, playerId, player.pos, room.state.lastDice, roomViews)
    if (!actionRequired) {
      finalizeTurn(room, playerId, room.state.lastRollWasDouble, false, roomViews)
    }
    return { success: true, actionRequired: true }
  }

  // 🔹 Для карт с оплатой/получением — только ОДИН вызов finalizeTurn!
  if (card.action === 'pay' || card.action === 'receive') {
    if (card.action === 'pay' && player.money < 0) {
      room.state.pendingPayment = { amount: Math.abs(player.money), creditorId: null, type: 'rent' }
      room.state.actionPending = 'INFO'
      broadcast(roomViews, room.id, {
        type: 'ACTION_REQUIRED',
        title: '💸 Оплата карты',
        message: 'Оплатите штраф по карте',
        icon: '💸',
        amount: Math.abs(player.money),
        isMandatory: true
      })
      return { success: true, actionRequired: true }
    }
    // ✅ Оплата/получение прошло успешно — завершаем ход и ВЫХОДИМ
    finalizeTurn(room, playerId, room.state.lastRollWasDouble, false, roomViews)
    return { success: true, actionRequired: false }
  }

  // 🔹 Для остальных карт (get_jail_card, none) — тоже один вызов
  finalizeTurn(room, playerId, room.state.lastRollWasDouble, false, roomViews)
  return { success: true, actionRequired: false }
}