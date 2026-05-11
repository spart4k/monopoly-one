// server/src/events/handlers/tradeAction.ts
import type { Room } from '../../rooms/Room'
import type { RoomView } from '../../rooms/RoomManager'
import { broadcast, buildSyncPayload } from '../../lib/ws-utils'
import { getSpaceById } from '../../shared/boardConfig'

function getTradeSummary(t: any, room: any): string {
  const p1 = room.getPlayer(t.initiator)?.name || 'Игрок 1'
  const p2 = room.getPlayer(t.responder)?.name || 'Игрок 2'

  const formatSide = (side: any, player: any) => {
    const items: string[] = []
    if (side.money > 0) items.push(`💰 ${side.money}₽`)
    if (side.jailCards > 0) items.push(`🎫 ${side.jailCards} карта выхода`)
    side.properties.forEach((id: number) => {
      const s = getSpaceById(id)
      items.push(s?.name || `🏠 #${id}`)
    })
    return items.length ? `[${player}: ${items.join(', ')}]` : `[${player}: ничего]`
  }

  return `${formatSide(t.from, p1)} ↔ ${formatSide(t.to, p2)}`
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
  room.addLog(`📝 ${room.getPlayer(initiator)?.name} готовит обмен с ${room.getPlayer(responder)?.name}...`)
  broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
  return { success: true }
}

export function handleTradeEdit(room: Room, playerId: string, side: 'from' | 'to', offer: any, roomViews: Map<string, RoomView>) {
  const t = room.state.activeTrade
  if (!t) return { error: 'Нет активного обмена' }

  const targetId = side === 'from' ? t.initiator : t.responder
  const owner = room.getPlayer(targetId)
  if (!owner) return { error: 'Владелец стороны не найден' }

  if ((offer.money ?? 0) > owner.money) return `${owner.name} не может отдать больше ${owner.money}₽`
  if ((offer.jailCards || 0) > owner.jailCards) return `У ${owner.name} нет карт выхода из тюрьмы`
  for (const id of (offer.properties || [])) {
    if (!owner.properties.includes(id)) return `${owner.name} не владеет этой улицей`
  }

  t[side] = { properties: offer.properties || [], money: offer.money ?? 0, jailCards: offer.jailCards || 0 }

  // 🔑 УБРАНО авто-сбрасывание статуса. Редактирование НЕ меняет ход.
  broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
  return { success: true }
}

export function handleTradePropose(room: Room, playerId: string, roomViews: Map<string, RoomView>) {
  const t = room.state.activeTrade
  if (!t) return { error: 'Нет активного обмена' }

  // Валидация обеих сторон перед отправкой
  const fromErr = handleTradeEdit(room, t.initiator, 'from', t.from, roomViews)
  const toErr = handleTradeEdit(room, t.responder, 'to', t.to, roomViews)
  if ((fromErr as any)?.error) return fromErr
  if ((toErr as any)?.error) return toErr

  const isEmpty = (o: any) => o.properties.length === 0 && o.money === 0 && o.jailCards === 0
  if (isEmpty(t.from) && isEmpty(t.to)) return { error: 'Обмен должен содержать хотя бы один предмет или сумму' }

  t.status = 'proposed'
  t.lastProposer = playerId
  room.addLog(`📤 ${room.getPlayer(playerId)?.name} предлагает обмен:\n${getTradeSummary(t, room)}`)
  broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
  return { success: true }
}

export function handleTradeAccept(room: Room, playerId: string, roomViews: Map<string, RoomView>) {
  const t = room.state.activeTrade
  if (!t || t.status !== 'proposed' || t.lastProposer === playerId) return { error: 'Принять может только адресат' }

  const p1 = room.getPlayer(t.initiator), p2 = room.getPlayer(t.responder)
  if (!p1 || !p2) return { error: 'Игроки не найдены' }

  // Атомарное применение
  t.from.properties.forEach((id: number) => { p1.properties = p1.properties.filter(x => x !== id); p2.properties.push(id) })
  t.to.properties.forEach((id: number) => { p2.properties = p2.properties.filter(x => x !== id); p1.properties.push(id) })

  p1.money -= t.from.money; p2.money += t.from.money
  p2.money -= t.to.money; p1.money += t.to.money
  p1.jailCards -= t.from.jailCards; p2.jailCards += t.from.jailCards
  p2.jailCards -= t.to.jailCards; p1.jailCards += t.to.jailCards

  room.addLog(`✅ Обмен завершен!\n${getTradeSummary(t, room)}`)
  room.state.activeTrade = null
  broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
  return { success: true }
}

export function handleTradeDecline(room: Room, playerId: string, roomViews: Map<string, RoomView>) {
  const t = room.state.activeTrade
  if (!t) return { error: 'Нет активного обмена' }
  if (t.initiator !== playerId && t.responder !== playerId) return { error: 'Вы не участник обмена' }

  room.addLog(`❌ ${room.getPlayer(playerId)?.name} отменил обмен`)
  room.state.activeTrade = null
  broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
  return { success: true }
}