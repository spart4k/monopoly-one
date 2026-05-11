// server/src/index.ts
import Fastify from 'fastify'
import fastifyCors from '@fastify/cors'
import fastifyWs from '@fastify/websocket'
import { RoomManager } from './rooms/RoomManager'
import { handleRollDice } from './events/handlers/rollDice'
import { handleBuyProperty, handlePassAction } from './events/handlers/buyProperty'
import { handlePayJailFine, useJailCard } from './events/handlers/jailAction'
import { handleBuyHouse, handleSellHouse } from './events/handlers/buildHouse'
import { handleTradeInit, handleTradeEdit, handleTradePropose, handleTradeAccept, handleTradeDecline } from './events/handlers/tradeAction'

const fastify = Fastify({ logger: false })
const roomManager = new RoomManager()
const allSockets = new Set<any>()

fastify.register(fastifyCors, { origin: '*' })
fastify.register(fastifyWs)

function broadcastLobbyUpdate() {
  const rooms = Array.from(roomManager.activeRooms.values()).map(r => ({
    id: r.id, status: r.state.status,
    players: r.state.players.map(p => ({ id: p.id, name: p.name, isReady: p.isReady })),
    maxPlayers: 4, createdBy: r.state.players[0]?.id || null
  }))
  const msg = JSON.stringify({ type: 'ROOMS_LIST', rooms })
  for (const sock of allSockets) if (sock.readyState === 1) sock.send(msg)
}

// 📦 Формирование payload с houses
function toPayload(room: any) {
  return {
    status: room.state.status,
    players: room.state.players.map((p:any)=>({
      id:p.id,name:p.name,color:p.color,pos:p.pos,money:p.money,properties:p.properties,
      houses: p.houses || {}, // 🔑 Передаем дома
      isInJail:p.isInJail,jailTurns:p.jailTurns,jailCards:p.jailCards,consecutiveDoubles:p.consecutiveDoubles,isReady:p.isReady
    })),
    currentTurn: room.state.currentTurn, logs: room.state.logs, lastDice: room.state.lastDice
  }
}

// server/src/index.ts (замени только handleEvent)
async function handleEvent(msg: string, socket: any) {
  try {
    const event = JSON.parse(msg)
    const { type, playerId, name, roomId, spaceId } = event

    console.log(`\n📥 [EV] INCOMING: ${type} | Player: ${playerId} | Room: ${roomId}`)

    let room: ReturnType<RoomManager['getRoom']>
    if (type === 'GET_LOBBY') { broadcastLobbyUpdate(); return }
    if (type === 'SET_READY') {
      const r = Array.from(roomManager.activeRooms.values()).find(r => r.id === roomId)
      if (r?.state.status === 'LOBBY') {
        const p = r.getPlayer(playerId)
        if (p && r.state.players[0]?.id !== playerId) {
          p.isReady = event.isReady !== false
          console.log(`✅ [READY] ${p.name} -> ${p.isReady}`)
          broadcastLobbyUpdate()
        }
      }
      return
    }

    if (type === 'JOIN_ROOM' || type === 'START_GAME') {
      if (!roomId) return socket.send(JSON.stringify({ type: 'ERROR', message: 'No roomId' }))
      room = await roomManager.getOrCreateRoom(roomId)
    } else {
      if (!playerId) return socket.send(JSON.stringify({ type: 'ERROR', message: 'No playerId' }))
      room = Array.from(roomManager.activeRooms.values()).find(r => r.getPlayer(playerId))
      if (!room) return socket.send(JSON.stringify({ type: 'ERROR', message: 'Player not found' }))
    }

    // Контекст перед обработкой
    console.log(`📊 [CTX] Turn: ${room.state.currentTurn} | Pending: ${room.state.actionPending} | LastDouble: ${room.state.lastRollWasDouble} | Status: ${room.state.status}`)

    if (type === 'JOIN_ROOM') {
      let player = room.getPlayer(playerId)
      if (!player) { player = room.addPlayer({ id: playerId, name, color: room.getNextColor(), pos: 0, money: 1500 }); room.addLog(`👤 ${name} присоединился`) }
      room.addSocket(playerId, socket)
      broadcastLobbyUpdate()
      for (const [_, s] of room.getSockets()) if (s.readyState === 1) s.send(JSON.stringify({ type: 'SYNC_STATE', payload: toPayload(room) }))
      return
    }

    if (type === 'START_GAME') {
      if (room.state.players[0]?.id !== playerId) return socket.send(JSON.stringify({ type: 'ERROR', message: 'Только создатель' }))
      if (room.state.status !== 'LOBBY' || room.playerCount < 2) return socket.send(JSON.stringify({ type: 'ERROR', message: 'Нужно 2+ игрока в лобби' }))
      const allReady = room.state.players.every(p => p.isReady || p.id === room.state.players[0]?.id)
      if (!allReady) return socket.send(JSON.stringify({ type: 'ERROR', message: 'Не все игроки нажали "Готов"' }))
      room.startGame(); broadcastLobbyUpdate()
      for (const [_, s] of room.getSockets()) if (s.readyState === 1) s.send(JSON.stringify({ type: 'SYNC_STATE', payload: toPayload(room) }))
      return
    }

    if (type === 'ROLL_DICE') { const r = handleRollDice(room, playerId, roomManager.getAllRoomViews(), event.targetSpaceId); if(r?.error) socket.send(JSON.stringify({type:'ERROR',message:r.error})); return }
    if (type === 'BUY_PROPERTY') { const r = handleBuyProperty(room, playerId, spaceId, roomManager.getAllRoomViews()); if(r?.error) socket.send(JSON.stringify({type:'ERROR',message:r.error})); return }
    if (type === 'PASS_ACTION') { const r = handlePassAction(room, playerId, roomManager.getAllRoomViews()); if(r?.error) socket.send(JSON.stringify({type:'ERROR',message:r.error})); return }
    if (type === 'PAY_JAIL_FINE' || type === 'USE_JAIL_CARD') { const fn = type === 'PAY_JAIL_FINE' ? handlePayJailFine : useJailCard; const r = fn(room, playerId, roomManager.getAllRoomViews()); if(r?.error) socket.send(JSON.stringify({type:'ERROR',message:r.error})); return }
    if (type === 'BUY_HOUSE') { const r = handleBuyHouse(room, playerId, spaceId, roomManager.getAllRoomViews()); if(r?.error) socket.send(JSON.stringify({type:'ERROR',message:r.error})); return }
    if (type === 'SELL_HOUSE') { const r = handleSellHouse(room, playerId, spaceId, roomManager.getAllRoomViews()); if(r?.error) socket.send(JSON.stringify({type:'ERROR',message:r.error})); return }

    // Обмен
    if (type === 'TRADE_INIT') { const r = handleTradeInit(room, playerId, event.responder, roomManager.getAllRoomViews()); if(r?.error) socket.send(JSON.stringify({type:'ERROR',message:r.error})); return }
    if (type === 'TRADE_EDIT') { const r = handleTradeEdit(room, playerId, event.side, event.offer, roomManager.getAllRoomViews()); if(r?.error) socket.send(JSON.stringify({type:'ERROR',message:r.error})); return }
    if (type === 'TRADE_PROPOSE') { const r = handleTradePropose(room, playerId, roomManager.getAllRoomViews()); if(r?.error) socket.send(JSON.stringify({type:'ERROR',message:r.error})); return }
    if (type === 'TRADE_ACCEPT') { const r = handleTradeAccept(room, playerId, roomManager.getAllRoomViews()); if(r?.error) socket.send(JSON.stringify({type:'ERROR',message:r.error})); return }
    if (type === 'TRADE_DECLINE') { const r = handleTradeDecline(room, playerId, roomManager.getAllRoomViews()); if(r?.error) socket.send(JSON.stringify({type:'ERROR',message:r.error})); return }

  } catch (e: any) {
    console.error(`💥 [EV] CRASH: ${e?.message}`)
    socket.send(JSON.stringify({ type: 'ERROR', message: `Server error: ${e?.message}` }))
  }
}

fastify.register(async (server) => {
  server.get('/ws', { websocket: true }, (connection, req) => {
    const socket = connection.socket
    allSockets.add(socket); broadcastLobbyUpdate()
    socket.on('message', async (raw) => {
      let msg = raw instanceof Buffer ? raw.toString('utf8') : typeof raw === 'string' ? raw : ''
      if (msg) await handleEvent(msg, socket)
    })
    socket.on('close', () => { allSockets.delete(socket); broadcastLobbyUpdate() })
  })
})

fastify.listen({ port: 3000, host: '0.0.0.0' }, (err) => {
  if (err) { console.error(err); process.exit(1) }
  console.log('🚀 Server ready: ws://0.0.0.0:3000/ws')
})