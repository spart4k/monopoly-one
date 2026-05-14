import Fastify from 'fastify'
import fastifyCors from '@fastify/cors'
import fastifyWs from '@fastify/websocket'
import { RoomManager } from './rooms/RoomManager'
import { buildSyncPayload } from './lib/ws-utils'

import {
  handleRollDice,
  handleBuyProperty,
  handlePassAction,
  handlePayJailFine,
  useJailCard,
  handleBuyHouse,
  handleSellHouse,
  handleTradeInit,
  handleTradeEdit,
  handleTradePropose,
  handleTradeAccept,
  handleTradeDecline,
  handleMortgage,
  handleUnmortgage,
  handleBankruptcy
} from './events'

const fastify = Fastify({ logger: false })
const roomManager = new RoomManager()
const allSockets = new Set<any>()

fastify.register(fastifyCors, { origin: '*' })
fastify.register(fastifyWs)

function broadcastLobbyUpdate(targetSocket?: any) {
  const rooms = Array.from(roomManager.activeRooms.values())
    .filter(r => r.state.status === 'LOBBY')
    .map(r => ({
      id: r.id,
      status: r.state.status,
      players: r.state.players.map(p => ({
        id: p.id,
        name: p.name,
        isReady: p.isReady
      })),
      maxPlayers: 4,
      createdBy: r.state.players[0]?.id || null
    }))

  const msg = JSON.stringify({ type: 'ROOMS_LIST', rooms })

  if (targetSocket) {
    try {
      if (targetSocket.readyState === 1) targetSocket.send(msg)
    } catch (e) { console.error(`💥 [LOBBY] Send error:`, e) }
    return
  }

  for (const sock of allSockets) {
    try {
      if (sock.readyState === 1) {
        const sockPlayerId = (sock as any).playerId
        const isInGame = sockPlayerId && Array.from(roomManager.activeRooms.values()).some(r => r.state.status === 'PLAYING' && r.getPlayer(sockPlayerId))
        if (!isInGame) sock.send(msg)
      }
    } catch (e) { console.error(`💥 [LOBBY] Broadcast error:`, e) }
  }
}

async function handleEvent(msg: string, socket: any) {
  try {
    const event = JSON.parse(msg)
    const { type, playerId, name, roomId: eventRoomId, spaceId } = event
    console.log(`\n📥 [EV] INCOMING: ${type} | Player: ${playerId} | Room: ${eventRoomId}`)

    if (playerId && playerId === 'null') {
      return socket.send(JSON.stringify({ type: 'ERROR', message: 'Invalid session. Please refresh.' }))
    }

    let room: ReturnType<RoomManager['getRoom']> | null = null

    if (type === 'GET_LOBBY') { broadcastLobbyUpdate(socket); return }
    if (type === 'SET_READY') {
      if (eventRoomId) room = roomManager.getRoom(eventRoomId)
      else if (playerId) room = Array.from(roomManager.activeRooms.values()).find(r => r.getPlayer(playerId))
      if (room?.state.status === 'LOBBY') {
        const p = room.getPlayer(playerId)
        if (p && room.state.players[0]?.id !== playerId) {
          p.isReady = event.isReady !== false
          broadcastLobbyUpdate()
        }
      }
      return
    }

    if (type === 'JOIN_ROOM') {
      const pid = playerId || (socket as any).playerId
      if (!pid) return socket.send(JSON.stringify({ type: 'ERROR', message: 'No playerId' }))
      if (!eventRoomId) return socket.send(JSON.stringify({ type: 'ERROR', message: 'No roomId' }))

      room = await roomManager.getOrCreateRoom(eventRoomId)
      let player = room.getPlayer(pid)
      if (!player) {
        player = room.addPlayer({ id: pid, name: name || `Player_${pid.slice(-4)}`, color: room.getNextColor(), pos: 0, money: 1500, mortgaged: [] })
        room.addLog(`👤 ${player.name} присоединился`)
      }
      room.addSocket(player.id, socket)
      ;(socket as any).playerId = player.id
      broadcastLobbyUpdate()
      socket.send(JSON.stringify({ type: 'MY_ID', playerId: player.id, roomId: room.id }))
      room.broadcastState()
      return
    }

    if (eventRoomId) {
      room = roomManager.getRoom(eventRoomId)
      if (!room) return socket.send(JSON.stringify({ type: 'ERROR', message: 'Комната не найдена' }))
    } else if (playerId) {
      room = Array.from(roomManager.activeRooms.values()).find(r => r.getPlayer(playerId))
      if (!room) return socket.send(JSON.stringify({ type: 'ERROR', message: 'Player not found in any room' }))
    } else {
      return socket.send(JSON.stringify({ type: 'ERROR', message: 'No playerId or roomId' }))
    }

    console.log(`📊 [CTX] Turn: ${room.state.currentTurn} | Pending: ${room.state.actionPending} | LastDouble: ${room.state.lastRollWasDouble} | Status: ${room.state.status}`)

    if (type === 'START_GAME') {
      if (room.state.players[0]?.id !== playerId) return socket.send(JSON.stringify({ type: 'ERROR', message: 'Только создатель' }))
      if (room.state.status !== 'LOBBY' || room.playerCount < 2) return socket.send(JSON.stringify({ type: 'ERROR', message: 'Нужно 2+ игрока в лобби' }))
      const allReady = room.state.players.every(p => p.isReady || p.id === room.state.players[0]?.id)
      if (!allReady) return socket.send(JSON.stringify({ type: 'ERROR', message: 'Не все игроки нажали "Готов"' }))
      room.startGame()
      broadcastLobbyUpdate()
      room.broadcastState()
      return
    }

    if (type === 'ROLL_DICE') { const r = handleRollDice(room, playerId, roomManager.getAllRoomViews(), event.targetSpaceId); if (r?.error) socket.send(JSON.stringify({ type: 'ERROR', message: r.error })); return }
    if (type === 'BUY_PROPERTY') { const r = handleBuyProperty(room, playerId, Number(spaceId), roomManager.getAllRoomViews()); if (r?.error) socket.send(JSON.stringify({ type: 'ERROR', message: r.error })); return }
    if (type === 'PASS_ACTION') { const r = handlePassAction(room, playerId, roomManager.getAllRoomViews()); if (r?.error) socket.send(JSON.stringify({ type: 'ERROR', message: r.error })); return }
    if (type === 'BANKRUPTCY') { const r = handleBankruptcy(room, playerId, roomManager.getAllRoomViews()); if (r?.error) socket.send(JSON.stringify({ type: 'ERROR', message: r.error })); return }
    if (type === 'PAY_JAIL_FINE' || type === 'USE_JAIL_CARD') { const fn = type === 'PAY_JAIL_FINE' ? handlePayJailFine : useJailCard; const r = fn(room, playerId, roomManager.getAllRoomViews()); if (r?.error) socket.send(JSON.stringify({ type: 'ERROR', message: r.error })); return }
    if (type === 'BUY_HOUSE') { const r = handleBuyHouse(room, playerId, Number(spaceId), roomManager.getAllRoomViews()); if (r?.error) socket.send(JSON.stringify({ type: 'ERROR', message: r.error })); return }
    if (type === 'SELL_HOUSE') { const r = handleSellHouse(room, playerId, Number(spaceId), roomManager.getAllRoomViews()); if (r?.error) socket.send(JSON.stringify({ type: 'ERROR', message: r.error })); return }
    if (type === 'TRADE_INIT') { const r = handleTradeInit(room, playerId, event.responder, roomManager.getAllRoomViews()); if (r?.error) socket.send(JSON.stringify({ type: 'ERROR', message: r.error })); return }
    if (type === 'TRADE_EDIT') { const r = handleTradeEdit(room, playerId, event.side, event.offer, roomManager.getAllRoomViews()); if (r?.error) socket.send(JSON.stringify({ type: 'ERROR', message: r.error })); return }
    if (type === 'TRADE_PROPOSE') { const r = handleTradePropose(room, playerId, roomManager.getAllRoomViews()); if (r?.error) socket.send(JSON.stringify({ type: 'ERROR', message: r.error })); return }
    if (type === 'TRADE_ACCEPT') { const r = handleTradeAccept(room, playerId, roomManager.getAllRoomViews()); if (r?.error) socket.send(JSON.stringify({ type: 'ERROR', message: r.error })); return }
    if (type === 'TRADE_DECLINE') { const r = handleTradeDecline(room, playerId, roomManager.getAllRoomViews()); if (r?.error) socket.send(JSON.stringify({ type: 'ERROR', message: r.error })); return }
    if (type === 'MORTGAGE_PROPERTY') { const r = handleMortgage(room, playerId, Number(event.spaceId), roomManager.getAllRoomViews()); if (r?.error) socket.send(JSON.stringify({ type: 'ERROR', message: r.error })); return }
    if (type === 'UNMORTGAGE_PROPERTY') { const r = handleUnmortgage(room, playerId, Number(event.spaceId), roomManager.getAllRoomViews()); if (r?.error) socket.send(JSON.stringify({ type: 'ERROR', message: r.error })); return }

  } catch (e: any) {
    console.error(`💥 [EV] CRASH: ${e?.message}`)
    socket.send(JSON.stringify({ type: 'ERROR', message: `Server error: ${e?.message}` }))
  }
}

fastify.register(async (server) => {
  server.get('/ws', { websocket: true }, (connection, req) => {
    const socket = connection.socket
    allSockets.add(socket)
    broadcastLobbyUpdate(socket)
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