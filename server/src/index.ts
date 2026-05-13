// server/src/index.ts
import Fastify from 'fastify'
import fastifyCors from '@fastify/cors'
import fastifyWs from '@fastify/websocket'
import { RoomManager } from './rooms/RoomManager'
import { buildSyncPayload } from './lib/ws-utils'

// 🔹 Импорт всех хендлеров из централизованного файла
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
  handleUnmortgage
} from './events'

const fastify = Fastify({ logger: false })
const roomManager = new RoomManager()
const allSockets = new Set<any>()

fastify.register(fastifyCors, { origin: '*' })
fastify.register(fastifyWs)

// 🔹 Рассылка списка комнат ТОЛЬКО игрокам в лобби
// 🔹 Рассылка списка комнат
function broadcastLobbyUpdate(targetSocket?: any) {
  const rooms = Array.from(roomManager.activeRooms.values())
    .filter(r => r.state.status === 'LOBBY') // Только лобби
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

  // 🔑 Если указан targetSocket → шлём ТОЛЬКО ему (для GET_LOBBY)
  if (targetSocket) {
    try {
      if (targetSocket.readyState === 1) { // WebSocket.OPEN
        targetSocket.send(msg)
        console.log(`📤 [LOBBY] Sent ROOMS_LIST to socket (${rooms.length} rooms)`)
      } else {
        console.warn(`⚠️ [LOBBY] Socket not ready: ${targetSocket.readyState}`)
      }
    } catch (e) {
      console.error(`💥 [LOBBY] Send error:`, e)
    }
    return
  }

  // 🔑 Иначе шлём всем, кто НЕ в активной игре
  for (const sock of allSockets) {
    try {
      if (sock.readyState === 1) {
        const sockPlayerId = (sock as any).playerId
        const isInGame = sockPlayerId &&
          Array.from(roomManager.activeRooms.values()).some(r =>
            r.state.status === 'PLAYING' && r.getPlayer(sockPlayerId)
          )
        if (!isInGame) {
          sock.send(msg)
        }
      }
    } catch (e) {
      console.error(`💥 [LOBBY] Broadcast error:`, e)
    }
  }
}

// 📦 Формирование payload
function toPayload(room: any) {
  return {
    status: room.state.status,
    players: room.state.players.map((p: any) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      pos: p.pos,
      money: p.money,
      properties: p.properties,
      houses: p.houses || {},
      mortgaged: p.mortgaged || [],
      isInJail: p.isInJail,
      jailTurns: p.jailTurns,
      jailCards: p.jailCards,
      consecutiveDoubles: p.consecutiveDoubles,
      isReady: p.isReady
    })),
    currentTurn: room.state.currentTurn,
    logs: room.state.logs,
    lastDice: room.state.lastDice,
    actionPending: room.state.actionPending,
    selectedSpaceId: room.state.selectedSpaceId,
    pendingCard: room.state.pendingCard,
    activeTrade: room.state.activeTrade
  }
}

// 📥 Обработчик событий
async function handleEvent(msg: string, socket: any) {
  try {
    const event = JSON.parse(msg)
    const { type, playerId, name, roomId: eventRoomId, spaceId } = event

    // 🔑 Блокируем строку "null" как playerId
    if (playerId && playerId === 'null') {
      console.warn(`⚠️ [EV] Blocked: playerId is string "null"`, event)
      return socket.send(JSON.stringify({ type: 'ERROR', message: 'Invalid session. Please refresh.' }))
    }

    console.log(`\n📥 [EV] INCOMING: ${type} | Player: ${playerId} | Room: ${eventRoomId}`)

    let room: ReturnType<RoomManager['getRoom']> | null = null

    // 🔹 GET_LOBBY — без привязки к комнате
    if (type === 'GET_LOBBY') {
      console.log(`📤 [EV] Sending ROOMS_LIST to ${playerId || 'anonymous'}`)
      broadcastLobbyUpdate(socket)
      return
    }

    // 🔹 SET_READY
    if (type === 'SET_READY') {
      if (eventRoomId) room = roomManager.getRoom(eventRoomId)
      else if (playerId) {
        room = Array.from(roomManager.activeRooms.values()).find(r => r.getPlayer(playerId))
      }
      if (room?.state.status === 'LOBBY') {
        const p = room.getPlayer(playerId)
        if (p && room.state.players[0]?.id !== playerId) {
          p.isReady = event.isReady !== false
          console.log(`✅ [READY] ${p.name} -> ${p.isReady}`)
          broadcastLobbyUpdate()
        }
      }
      return
    }

    // 🔹 JOIN_ROOM — создаёт комнату, если её нет
    if (type === 'JOIN_ROOM') {
      const pid = playerId || (socket as any).playerId
      if (!pid) return socket.send(JSON.stringify({ type: 'ERROR', message: 'No playerId' }))
      if (!eventRoomId) return socket.send(JSON.stringify({ type: 'ERROR', message: 'No roomId' }))

      room = await roomManager.getOrCreateRoom(eventRoomId)

      let player = room.getPlayer(pid)
      if (!player) {
        player = room.addPlayer({
          id: pid,
          name: name || `Player_${pid.slice(-4)}`,
          color: room.getNextColor(),
          pos: 0,
          money: 1500,
          mortgaged: []
        })
        room.addLog(`👤 ${player.name} присоединился`)
        console.log(`🏗 [ROOM] Created new player ${player.name} in room ${room.id}`)
      }
      room.addSocket(player.id, socket)
      ;(socket as any).playerId = player.id

      broadcastLobbyUpdate()

      socket.send(JSON.stringify({
        type: 'MY_ID',
        playerId: player.id,
        roomId: room.id
      }))

      room.broadcastState()
      console.log(`✅ [JOIN] ${player.name} joined/created room ${room.id}`)
      return
    }

    // 🔹 Для всех остальных событий: ищем существующую комнату
    if (eventRoomId) {
      room = roomManager.getRoom(eventRoomId)
      if (!room) {
        return socket.send(JSON.stringify({
          type: 'ERROR',
          message: 'Комната не найдена',
          debug: { requested: eventRoomId, available: Array.from(roomManager.activeRooms.keys()) }
        }))
      }
    } else if (playerId) {
      room = Array.from(roomManager.activeRooms.values()).find(r => r.getPlayer(playerId))
      if (!room) {
        return socket.send(JSON.stringify({ type: 'ERROR', message: 'Player not found in any room' }))
      }
    } else {
      return socket.send(JSON.stringify({ type: 'ERROR', message: 'No playerId or roomId' }))
    }

    // Контекст перед обработкой
    console.log(`📊 [CTX] Turn: ${room.state.currentTurn} | Pending: ${room.state.actionPending} | LastDouble: ${room.state.lastRollWasDouble} | Status: ${room.state.status}`)

    // 🔹 START_GAME
    if (type === 'START_GAME') {
      if (room.state.players[0]?.id !== playerId) {
        return socket.send(JSON.stringify({ type: 'ERROR', message: 'Только создатель' }))
      }
      if (room.state.status !== 'LOBBY' || room.playerCount < 2) {
        return socket.send(JSON.stringify({ type: 'ERROR', message: 'Нужно 2+ игрока в лобби' }))
      }
      const allReady = room.state.players.every(p => p.isReady || p.id === room.state.players[0]?.id)
      if (!allReady) {
        return socket.send(JSON.stringify({ type: 'ERROR', message: 'Не все игроки нажали "Готов"' }))
      }
      room.startGame()
      broadcastLobbyUpdate()
      room.broadcastState()
      return
    }

    // 🔹 Обработчики событий игры
    if (type === 'ROLL_DICE') {
      const r = handleRollDice(room, playerId, roomManager.getAllRoomViews(), event.targetSpaceId)
      if (r?.error) socket.send(JSON.stringify({ type: 'ERROR', message: r.error }))
      return
    }
    if (type === 'BUY_PROPERTY') {
      const r = handleBuyProperty(room, playerId, Number(spaceId), roomManager.getAllRoomViews())
      if (r?.error) socket.send(JSON.stringify({ type: 'ERROR', message: r.error }))
      return
    }
    if (type === 'PASS_ACTION') {
      const r = handlePassAction(room, playerId, roomManager.getAllRoomViews())
      if (r?.error) socket.send(JSON.stringify({ type: 'ERROR', message: r.error }))
      return
    }
    if (type === 'PAY_JAIL_FINE' || type === 'USE_JAIL_CARD') {
      const fn = type === 'PAY_JAIL_FINE' ? handlePayJailFine : useJailCard
      const r = fn(room, playerId, roomManager.getAllRoomViews())
      if (r?.error) socket.send(JSON.stringify({ type: 'ERROR', message: r.error }))
      return
    }
    if (type === 'BUY_HOUSE') {
      const r = handleBuyHouse(room, playerId, Number(spaceId), roomManager.getAllRoomViews())
      if (r?.error) socket.send(JSON.stringify({ type: 'ERROR', message: r.error }))
      return
    }
    if (type === 'SELL_HOUSE') {
      const r = handleSellHouse(room, playerId, Number(spaceId), roomManager.getAllRoomViews())
      if (r?.error) socket.send(JSON.stringify({ type: 'ERROR', message: r.error }))
      return
    }

    // 🔹 Обмен
    if (type === 'TRADE_INIT') {
      const r = handleTradeInit(room, playerId, event.responder, roomManager.getAllRoomViews())
      if (r?.error) socket.send(JSON.stringify({ type: 'ERROR', message: r.error }))
      return
    }
    if (type === 'TRADE_EDIT') {
      const r = handleTradeEdit(room, playerId, event.side, event.offer, roomManager.getAllRoomViews())
      if (r?.error) socket.send(JSON.stringify({ type: 'ERROR', message: r.error }))
      return
    }
    if (type === 'TRADE_PROPOSE') {
      const r = handleTradePropose(room, playerId, roomManager.getAllRoomViews())
      if (r?.error) socket.send(JSON.stringify({ type: 'ERROR', message: r.error }))
      return
    }
    if (type === 'TRADE_ACCEPT') {
      const r = handleTradeAccept(room, playerId, roomManager.getAllRoomViews())
      if (r?.error) socket.send(JSON.stringify({ type: 'ERROR', message: r.error }))
      return
    }
    if (type === 'TRADE_DECLINE') {
      const r = handleTradeDecline(room, playerId, roomManager.getAllRoomViews())
      if (r?.error) socket.send(JSON.stringify({ type: 'ERROR', message: r.error }))
      return
    }

    // 🔹 Залог
    if (type === 'MORTGAGE_PROPERTY') {
      const r = handleMortgage(room, playerId, Number(event.spaceId), roomManager.getAllRoomViews())
      if (r?.error) socket.send(JSON.stringify({ type: 'ERROR', message: r.error }))
      return
    }
    if (type === 'UNMORTGAGE_PROPERTY') {
      const r = handleUnmortgage(room, playerId, Number(event.spaceId), roomManager.getAllRoomViews())
      if (r?.error) socket.send(JSON.stringify({ type: 'ERROR', message: r.error }))
      return
    }

  } catch (e: any) {
    console.error(`💥 [EV] CRASH: ${e?.message}`)
    socket.send(JSON.stringify({ type: 'ERROR', message: `Server error: ${e?.message}` }))
  }
}

// 🔹 WebSocket сервер
fastify.register(async (server) => {
  server.get('/ws', { websocket: true }, (connection, req) => {
    const socket = connection.socket
    allSockets.add(socket)
    broadcastLobbyUpdate(socket)

    socket.on('message', async (raw) => {
      let msg = raw instanceof Buffer ? raw.toString('utf8') : typeof raw === 'string' ? raw : ''
      if (msg) await handleEvent(msg, socket)
    })

    socket.on('close', () => {
      allSockets.delete(socket)
      broadcastLobbyUpdate()
    })
  })
})

fastify.listen({ port: 3000, host: '0.0.0.0' }, (err) => {
  if (err) { console.error(err); process.exit(1) }
  console.log('🚀 Server ready: ws://0.0.0.0:3000/ws')
})