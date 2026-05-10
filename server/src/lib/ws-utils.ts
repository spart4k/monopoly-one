// server/src/lib/ws-utils.ts
import type { RoomView } from '../rooms/RoomManager'

export function buildSyncPayload(state: any) {
  return {
    status: state.status,
    players: state.players.map((p: any) => ({
      id: p.id, name: p.name, color: p.color, pos: p.pos,
      money: p.money, properties: p.properties,
      isInJail: p.isInJail, jailTurns: p.jailTurns,
      jailCards: p.jailCards, consecutiveDoubles: p.consecutiveDoubles
    })),
    currentTurn: state.currentTurn,
    logs: state.logs,
    lastDice: state.lastDice
  }
}

export function broadcast(
  roomViews: Map<string, RoomView>,
  roomId: string,
  event: any,
  excludePlayerId?: string
) {
  const roomView = roomViews.get(roomId)
  // 🔑 КЛЮЧЕВОЙ ФИКС: перебираем .sockets, а не сам объект RoomView
  if (!roomView || !roomView.sockets) return

  for (const [pid, sock] of roomView.sockets) {
    if (excludePlayerId && pid === excludePlayerId) continue
    if (sock.readyState === 1) { // WebSocket.OPEN
      sock.send(JSON.stringify(event))
    }
  }
}