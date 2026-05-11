// server/src/events/handlers/tradeAction.ts
import type { Room } from '../../rooms/Room'
import type { RoomView } from '../../rooms/RoomManager'
import { broadcast, buildSyncPayload } from '../../lib/ws-utils'

function validateOffer(room: Room, playerId: string, offer: any): string | null {
  const p = room.getPlayer(playerId)
  if (!p) return 'Игрок не найден'
  if (offer.money > p.money) return `Недостаточно денег (нужно ${offer.money}₽)`
  if (offer.jailCards > p.jailCards) return 'Нет карты "Выход из тюрьмы"'
  for (const id of offer.properties) {
    if (!p.properties.includes(id)) return `Нет прав на клетку ${id}`
  }
  return null
}

export function handleTradeInit(room: Room, initiator: string, responder: string, roomViews: Map<string, RoomView>) {
  if (room.state.status !== 'PLAYING') return { error: 'Игра не активна' }
  if (!room.getPlayer(initiator) || !room.getPlayer(responder) || initiator === responder) return { error: 'Некорректные игроки' }
  if (room.state.activeTrade) return { error: 'Уже идет обмен' }

  room.state.activeTrade = {
    initiator, responder,
    from: { properties: [], money: 0, jailCards: 0 },
    to: { properties: [], money: 0, jailCards: 0 },
    status: 'draft',
    lastProposer: null,
    messages: []
  }
  // 🔑 Лог только для инициатора (черновик)
  room.addLog(`📝 ${room.getPlayer(initiator)?.name} готовит обмен с ${room.getPlayer(responder)?.name}...`)
  broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
  return { success: true }
}

export function handleTradeEdit(room: Room, playerId: string, side: 'from' | 'to', offer: any, roomViews: Map<string, RoomView>) {
  const t = room.state.activeTrade
  if (!t) return { error: 'Нет активного обмена' }

  // 🔑 Определяем, чьё имущество/деньги на самом деле редактируются
  const targetId = side === 'from' ? t.initiator : t.responder
  const owner = room.getPlayer(targetId)
  if (!owner) return { error: 'Владелец стороны не найден' }

  // Валидация денег и карт выхода из тюрьмы
  if ((offer.money ?? 0) > owner.money) return `Недостаточно денег у ${owner.name}`
  if ((offer.jailCards || 0) > owner.jailCards) return `Нет карты "Выход из тюрьмы" у ${owner.name}`

  // Валидация прав на участки
  for (const id of (offer.properties || [])) {
    if (!owner.properties.includes(id)) return `${owner.name} не владеет клеткой ${id}`
  }

  // 🔑 Применяем изменения (инициатор может править ОБЕ стороны в draft)
  t[side] = {
    properties: offer.properties || [],
    money: offer.money ?? 0,
    jailCards: offer.jailCards || 0
  }

  // Если предложение уже висело, сбрасываем в черновик (контр-предложение)
  if (t.status === 'proposed') {
    t.status = 'draft'; t.lastProposer = null
    room.addLog(`🔄 ${room.getPlayer(playerId)?.name} изменил условия обмена`)
  }

  broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
  return { success: true }
}

export function handleTradePropose(room: Room, playerId: string, roomViews: Map<string, RoomView>) {
  const t = room.state.activeTrade
  if (!t || t.status !== 'draft') return { error: 'Нечего предлагать' }
  const fromErr = validateOffer(room, t.initiator, t.from)
  const toErr = validateOffer(room, t.responder, t.to)
  if (fromErr || toErr) return { error: fromErr || toErr }
  if (t.from.properties.length === 0 && t.to.properties.length === 0 && t.from.money === 0 && t.to.money === 0 && t.from.jailCards === 0 && t.to.jailCards === 0) return { error: 'Обмен должен содержать хотя бы один предмет или сумму' }

  t.status = 'proposed'
  t.lastProposer = playerId
  // 🔑 Лог для обоих (предложение отправлено)
  room.addLog(`📤 ${room.getPlayer(playerId)?.name} отправил предложение обмена игроку ${room.getPlayer(t.responder)?.name}`)
  broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
  return { success: true }
}

export function handleTradeAccept(room: Room, playerId: string, roomViews: Map<string, RoomView>) {
  const t = room.state.activeTrade
  if (!t || t.status !== 'proposed') return { error: 'Нет предложения' }
  if (t.lastProposer === playerId) return { error: 'Принять может только адресат' }

  const p1 = room.getPlayer(t.initiator), p2 = room.getPlayer(t.responder)
  if (!p1 || !p2) return { error: 'Игроки не найдены' }

  // Атомарное применение
  t.from.properties.forEach(id => { p1.properties = p1.properties.filter(x => x !== id); p2.properties.push(id) })
  t.to.properties.forEach(id => { p2.properties = p2.properties.filter(x => x !== id); p1.properties.push(id) })
  p1.money -= t.from.money; p2.money += t.from.money
  p2.money -= t.to.money; p1.money += t.to.money
  p1.jailCards -= t.from.jailCards; p2.jailCards += t.from.jailCards
  p2.jailCards -= t.to.jailCards; p1.jailCards += t.to.jailCards

  room.addLog(`🤝 ${p1.name} и ${p2.name} завершили обмен`)
  room.state.activeTrade = null
  broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
  return { success: true }
}

export function handleTradeDecline(room: Room, playerId: string, roomViews: Map<string, RoomView>) {
  const t = room.state.activeTrade
  if (!t) return { error: 'Нет активного обмена' }
  if (t.initiator !== playerId && t.responder !== playerId) return { error: 'Вы не участник обмена' }

  // ✅ Работает и для 'draft' (Отмена), и для 'proposed' (Отклонить)
  room.addLog(`❌ ${room.getPlayer(playerId)?.name} отменил обмен`)
  room.state.activeTrade = null

  broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
  return { success: true }
}