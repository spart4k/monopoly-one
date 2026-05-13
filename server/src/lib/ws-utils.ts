// server/src/lib/ws-utils.ts
import type { RoomView } from '../rooms/RoomManager'

export function buildSyncPayload(state: any, currentPlayerId?: string) {
  return {
    status: state.status,
    players: state.players.map((p: any) => ({
      id: p.id, name: p.name, color: p.color, pos: p.pos, money: p.money,
      properties: p.properties, houses: p.houses || {},
      mortgaged: p.mortgaged || [], // 🔑 КРИТИЧНО: отправляем список заложенных улиц
      isInJail: p.isInJail, jailTurns: p.jailTurns, jailCards: p.jailCards,
      consecutiveDoubles: p.consecutiveDoubles,
      housesBoughtThisTurn: p.housesBoughtThisTurn || false
    })),
    currentTurn: state.currentTurn, logs: state.logs, lastDice: state.lastDice,
    currentPlayerId,
    pendingPayment: state.pendingPayment || null, // 🔑 NEW
    pendingCard: state.pendingCard,
    activeTrade: state.activeTrade
  }
}

export function broadcast(
  roomViews: Map<string, RoomView>,
  roomId: string,
  event: any,
  excludePlayerId?: string
) {
  const roomView = roomViews.get(roomId)
  if (!roomView || !roomView.sockets) return

  for (const [pid, sock] of roomView.sockets) {
    if (excludePlayerId && pid === excludePlayerId) continue
    if (sock.readyState === 1) {
      sock.send(JSON.stringify(event))
    }
  }
}