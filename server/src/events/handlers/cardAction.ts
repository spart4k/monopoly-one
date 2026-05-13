// server/src/events/handlers/cardAction.ts
import type { Room } from '../../rooms/Room'
import type { RoomView } from '../../rooms/RoomManager'
import { broadcast, buildSyncPayload } from '../../lib/ws-utils'

// 🔹 Пример колоды (замени на свою, если она в другом файле)
const CHANCE_CARDS = [
  { text: 'Отправляйтесь на пр. Кирова', action: 'move', targetSpaceId: 6 },
  { text: 'Банковская ошибка в вашу пользу. Получите 200₽', action: 'receive', amount: 200 },
  { text: 'Штраф за превышение скорости. Заплатите 15₽', action: 'pay', amount: 15 },
  { text: 'Идите в тюрьму. Не проходите СТАРТ', action: 'go_to_jail' },
  { text: 'Вы выиграли кроссворд. Получите 50₽', action: 'receive', amount: 50 },
  { text: 'Вернитесь на 3 клетки назад', action: 'move_back', steps: 3 }
]

const COMMUNITY_CARDS = [
  { text: 'Вы выиграли второй приз в конкурсе красоты. Получите 100₽', action: 'receive', amount: 100 },
  { text: 'Оплата обучения. Заплатите 50₽', action: 'pay', amount: 50 },
  { text: 'Отправляйтесь на СТАРТ', action: 'move', targetSpaceId: 0 },
  { text: 'Идите в тюрьму', action: 'go_to_jail' },
  { text: 'Карта "Выход из тюрьмы"', action: 'get_jail_card' },
  { text: 'Наследство. Получите 150₽', action: 'receive', amount: 150 }
]

export function handleDrawCard(
  room: Room,
  playerId: string,
  cardType: 'chance' | 'community',
  roomViews: Map<string, RoomView>
) {
  const player = room.getPlayer(playerId)
  if (!player) return { success: false }

  // 🔑 Выбираем случайную карту
  const deck = cardType === 'chance' ? CHANCE_CARDS : COMMUNITY_CARDS
  const card = deck[Math.floor(Math.random() * deck.length)]

  // 🔑 КРИТИЧНО: НЕ ВЫПОЛНЯЕМ эффект! Только сохраняем в состояние
  room.state.pendingCard = card
  room.state.actionPending = 'CARD'

  room.addLog(`🃏 ${player.name}: "${card.text}"`)

  // Рассылаем состояние с сохранённой картой
  broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
  return { success: true, actionRequired: true }
}