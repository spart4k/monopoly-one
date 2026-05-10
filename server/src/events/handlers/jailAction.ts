// server/src/events/handlers/jailAction.ts
import type { Room } from '../../rooms/Room'
import type { RoomView } from '../../rooms/RoomManager'
import { broadcast, buildSyncPayload } from '../../lib/ws-utils'

export function handlePayJailFine(room: Room, playerId: string, roomViews: Map<string, RoomView>) {
  const p = room.getPlayer(playerId)
  if (!p || !p.isInJail || p.money < 50) return { error: 'Нельзя выйти из тюрьмы' }

  p.money -= 50
  p.isInJail = false
  p.jailTurns = 0
  room.addLog(`💸 ${p.name} заплатил 50₽ штрафа за выход из тюрьмы`)
  room.finishTurn()
  broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
  return { success: true }
}

export function useJailCard(room: Room, playerId: string, roomViews: Map<string, RoomView>) {
  const p = room.getPlayer(playerId)
  if (!p || !p.isInJail || p.jailCards < 1) return { error: 'Нет карты выхода' }

  p.jailCards--
  p.isInJail = false
  p.jailTurns = 0
  room.addLog(`🎫 ${p.name} использовал карту "Выход из тюрьмы"`)
  room.finishTurn()
  broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
  return { success: true }
}