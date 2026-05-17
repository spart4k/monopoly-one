// server/src/events/handlers/cardAction.ts
import type { Room } from '../../rooms/Room'
import type { RoomView } from '../../rooms/RoomManager'
import { broadcast } from '../../lib/ws-utils'
import { CARDS, type Card } from '../../shared/boardConfig'

const CARD_DECKS = { chance: CARDS.chance, community: CARDS.community }

export function handleDrawCard(room: Room, playerId: string, cardType: string, roomViews: Map<string, RoomView>) {
  const player = room.getPlayer(playerId)
  if (!player) return { success: false, actionRequired: false }

  const deck = CARD_DECKS[cardType as keyof typeof CARD_DECKS] || CARD_DECKS.chance
  const card: Card = deck[Math.floor(Math.random() * deck.length)]

  // 🔹 ТОЛЬКО сохраняем карту в состояние, НЕ применяем эффекты!
  room.state.pendingCard = { ...card, type: cardType }
  room.state.actionPending = 'CARD'
  room.state.selectedSpaceId = null // Сбрасываем, чтобы не было конфликтов с модалкой

  room.addLog(`🃏 ${player.name}: "${card.text}"`)
  broadcast(roomViews, room.id, {
    type: 'ACTION_REQUIRED',
    title: cardType === 'chance' ? '🎲 Шанс' : '💰 Казна',
    message: card.text,
    icon: card.action === 'pay' ? '💸' : card.action === 'receive' ? '🎁' : card.action === 'go_to_jail' ? '🚔' : '🃏',
    card
  })

  // 🔹 Требует нажатия "Далее"
  return { success: true, actionRequired: true }
}