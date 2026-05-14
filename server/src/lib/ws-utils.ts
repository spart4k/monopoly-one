// server/src/lib/ws-utils.ts
import type { RoomView } from '../rooms/RoomManager'

// server/src/lib/ws-utils.ts
export function buildSyncPayload(state: any) {
  const payload = {
    status: state.status,
    players: state.players.map((p: any) => ({
      id: p.id, name: p.name, color: p.color, pos: p.pos, money: p.money,
      properties: p.properties, houses: p.houses || {}, mortgaged: p.mortgaged || [],
      isInJail: p.isInJail, jailTurns: p.jailTurns, jailCards: p.jailCards,
      consecutiveDoubles: p.consecutiveDoubles, housesBoughtThisTurn: p.housesBoughtThisTurn || false
    })),
    currentTurn: state.currentTurn,
    logs: state.logs,
    lastDice: state.lastDice,
    // 🔑 КРИТИЧНО: эти поля управляют UI-панелями
    actionPending: state.actionPending,
    selectedSpaceId: state.selectedSpaceId,
    pendingCard: state.pendingCard,
    pendingPayment: state.pendingPayment,
    activeTrade: state.activeTrade
  }

  if (state.actionPending === 'INFO') {
    console.log(`📤 [PAYLOAD] SYNC_STATE pendingPayment:`, JSON.stringify(state.pendingPayment))
  }

  return payload
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