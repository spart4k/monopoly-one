// server/src/events/handlers/cardAction.ts
import type { Room } from '../../rooms/Room'
import type { RoomView } from '../../rooms/RoomManager'
import { broadcast, buildSyncPayload } from '../../lib/ws-utils'
import { getSpaceById } from '../../shared/boardConfig'

type CardAction = 'pay' | 'receive' | 'move' | 'go_to_jail' | 'get_card' | 'move_to_start'

const CARDS: {
  id: string, text: string, action: CardAction,
  money?: number, move?: number, goToJail?: boolean, jailCard?: number
}[] = [
  { id: 'c1', text: 'Отправляйтесь на СТАРТ. Получите 200₽', action: 'move_to_start', move: 0, money: 200 },
  { id: 'c2', text: 'Банковская ошибка в вашу пользу. Получите 200₽', action: 'receive', money: 200 },
  { id: 'c3', text: 'Оплата услуг врача. Заплатите 50₽', action: 'pay', money: -50 },
  { id: 'c4', text: 'Штраф за превышение скорости. Заплатите 15₽', action: 'pay', money: -15 },
  { id: 'c5', text: 'Карта "Выход из тюрьмы"', action: 'get_card', jailCard: 1 },
  { id: 'c6', text: 'Отправляйтесь в тюрьму', action: 'go_to_jail', goToJail: true },
  { id: 'c7', text: 'Отправляйтесь на пр. Кирова', action: 'move', move: 6 },
  { id: 'c8', text: 'Ваш вклад погашен. Получите 100₽', action: 'receive', money: 100 },
]

export function handleDrawCard(room: Room, playerId: string, type: string, roomViews: Map<string, RoomView>) {
  const player = room.getPlayer(playerId)
  if (!player) return { error: 'Игрок не найден' }

  const card = CARDS[Math.floor(Math.random() * CARDS.length)]

  if (card.move !== undefined) {
    player.pos = card.move
    room.addLog(`🔀 ${player.name} перемещён на клетку ${card.move}`)
  }
  if (card.money) {
    player.money += card.money
    room.addLog(`💰 ${player.name}: ${card.money > 0 ? '+' : ''}${card.money}₽`)
  }
  if (card.jailCard) player.jailCards += card.jailCard
  if (card.goToJail) {
    player.pos = 10; player.isInJail = true; player.jailTurns = 0
    room.addLog(`🚔 ${player.name} отправлен в тюрьму!`)
  }

  room.addLog(`🃏 ${player.name}: "${card.text}"`)
  room.state.actionPending = 'CARD'

  // 🔑 Отправляем клиенту полный объект карты для UI
  broadcast(roomViews, room.id, {
    type: 'CARD_DRAWN',
    card: { text: card.text, action: card.action, amount: card.money }
  })
  broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })

  return { success: true, actionRequired: true }
}