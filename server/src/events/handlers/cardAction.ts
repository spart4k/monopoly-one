// server/src/events/handlers/cardAction.ts
import type { Room } from '../../rooms/Room'
import type { RoomView } from '../../rooms/RoomManager'
import { broadcast } from '../../lib/ws-utils'

const CARDS = [
  { id: 'c1', text: 'Отправляйтесь на СТАРТ. Получите 200₽', move: 0, money: 200 },
  { id: 'c2', text: 'Банковская ошибка в вашу пользу. Получите 200₽', money: 200 },
  { id: 'c3', text: 'Оплата услуг врача. Заплатите 50₽', money: -50 },
  { id: 'c4', text: 'Штраф за превышение скорости. Заплатите 15₽', money: -15 },
  { id: 'c5', text: 'Карта "Выход из тюрьмы"', jailCard: 1 },
  { id: 'c6', text: 'Отправляйтесь в тюрьму', goToJail: true },
  { id: 'c7', text: 'Отправляйтесь на пр. Кирова', move: 7 },
  { id: 'c8', text: 'Ваш вклад погашен. Получите 100₽', money: 100 },
]

export function handleDrawCard(room: Room, playerId: string, type: string, roomViews: Map<string, RoomView>) {
  const player = room.getPlayer(playerId)
  if (!player) return { error: 'Игрок не найден' }

  const card = CARDS[Math.floor(Math.random() * CARDS.length)]

  // Применяем эффекты
  if (card.move !== undefined) player.pos = card.move
  if (card.money) player.money += card.money
  if (card.jailCard) player.jailCards += card.jailCard
  if (card.goToJail) { player.pos = 10; player.isInJail = true; player.jailTurns = 0 }

  room.addLog(`🃏 ${player.name}: "${card.text}"`)
  room.state.actionPending = 'CARD'

  // 🔑 Отправляем ТОЛЬКО карту. SYNC_STATE не шлём, чтобы модалка не закрылась раньше времени.
  broadcast(roomViews, room.id, { type: 'CARD_DRAWN', cardId: card.id, text: card.text })

  return { success: true, actionRequired: true }
}