// server/src/index.ts
import 'dotenv/config'

import Fastify from 'fastify'
import fastifyCors from '@fastify/cors'
import fastifyWebsocket from '@fastify/websocket'
import { RoomManager } from './rooms/RoomManager'
import { buildSyncPayload, broadcast } from './lib/ws-utils'
import { verifyToken } from './lib/auth'
import { handleRegister, handleLogin } from './events/auth'
import { registerAdminRoutes } from './modules/admin/admin.routes'
import { handleJoinRoom } from './events/handlers/joinRoom'

import {
  handleRollDice,
  handleBuyProperty,
  handlePassAction,
  handleBankruptcy,
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
const guestRegistry = new Map<string, string>()

// 🔹 1. Плагины
fastify.register(fastifyCors, { origin: '*' })
fastify.register(fastifyWebsocket)

// 🔹 2. REST-роуты админки
registerAdminRoutes(fastify, roomManager)

// 🔹 Хелпер рассылки списка лобби
function broadcastLobbyUpdate(targetSocket?: any) {
  const rooms = Array.from(roomManager.activeRooms.values())
    .filter(r => r.state.status === 'LOBBY')
    .map(r => ({
      id: r.id,
      status: r.state.status,
      players: r.state.players.map(p => ({ id: p.id, name: p.name, isReady: p.isReady })),
      maxPlayers: 4,
      createdBy: r.state.players[0]?.id || null
    }))

  const msg = JSON.stringify({ type: 'ROOMS_LIST', rooms })

  if (targetSocket) {
    try { if (targetSocket.readyState === 1) targetSocket.send(msg) } catch {}
    return
  }

  for (const sock of allSockets) {
    try {
      if (sock.readyState === 1) {
        const pid = (sock as any).playerId
        const isInGame = pid && Array.from(roomManager.activeRooms.values()).some(r => r.state.status === 'PLAYING' && r.getPlayer(pid))
        if (!isInGame) sock.send(msg)
      }
    } catch {}
  }
}

// 🔹 3. WebSocket подключение
fastify.register(async (server) => {
  server.get('/ws', { websocket: true }, (connection, req) => {
    const socket = connection.socket
    allSockets.add(socket)

    // 🔑 Токен из query (для админки)
    const token = (req.query as any)?.token
    if (token) {
      const payload = verifyToken(token)
      if (payload) {
        socket.user = payload
        if (payload.role === 'admin') socket.isAdmin = true
      }
    }

    broadcastLobbyUpdate(socket)

    // 🔹 Обработка сообщений
    socket.on('message', async (raw: Buffer | string) => {
      const msg = raw instanceof Buffer ? raw.toString('utf8') : typeof raw === 'string' ? raw : ''
      if (!msg) return

      try {
        const event = JSON.parse(msg)
        const { type, playerId, name, roomId: eventRoomId, nickname, spaceId, email, password } = event

        console.log(`\n📥 [EV] INCOMING: type="${type}", playerId="${playerId}", roomId="${eventRoomId}"`)

        // =================================================================
        // 🔥 ПУБЛИЧНЫЕ СОБЫТИЯ — ОБРАБАТЫВАЕМ ПЕРВЫМИ (без проверки комнаты)
        // =================================================================

        // 🔹 1. Регистрация ника
        if (type === 'SET_NICKNAME') {
          console.log(`🎯 [HANDLER] SET_NICKNAME entered`)
          const nick = nickname?.trim()
          if (!nick || nick.length < 2 || nick.length > 20) {
            return socket.send(JSON.stringify({ type: 'ERROR', message: 'Ник от 2 до 20 символов' }))
          }
          if (!/^[\w\s\u0400-\u04FF\-]+$/u.test(nick)) {
            return socket.send(JSON.stringify({ type: 'ERROR', message: 'Только буквы, цифры, пробелы и -' }))
          }

          const norm = nick.toLowerCase()
          const isTaken = Array.from(guestRegistry.keys()).some(n => n.toLowerCase() === norm) ||
            Array.from(roomManager.activeRooms.values()).some(r =>
              r.state.players.some(p => p.name.toLowerCase() === norm)
            )

          if (isTaken) {
            return socket.send(JSON.stringify({ type: 'ERROR', message: 'Этот ник уже занят' }))
          }

          const newPlayerId = `p_${Math.random().toString(36).substring(2, 10)}`
          guestRegistry.set(norm, newPlayerId)
          socket.playerId = newPlayerId
          socket.nickname = nick

          console.log(`✅ [AUTH] Guest: ${nick} -> ${newPlayerId}`)
          socket.send(JSON.stringify({ type: 'NICKNAME_ACCEPTED', playerId: newPlayerId, nickname: nick }))
          return
        }

        // 🔹 2. Запрос лобби
        if (type === 'GET_LOBBY') {
          console.log(`🎯 [HANDLER] GET_LOBBY entered`)
          broadcastLobbyUpdate(socket)
          return
        }

        // 🔹 3. Авторизация
        if (type === 'REGISTER' || type === 'LOGIN') {
          console.log(`🎯 [HANDLER] AUTH entered: ${type}`)
          const res = type === 'REGISTER'
            ? await handleRegister(email, nickname, password)
            : await handleLogin(email, password)
          socket.send(JSON.stringify(res.error ? { type: 'ERROR', message: res.error } : { type: 'AUTH_SUCCESS', ...res }))
          return
        }

        // =================================================================
        // 🎮 JOIN_ROOM — МОЖЕТ СОЗДАТЬ НОВУЮ КОМНАТУ (обрабатываем ДО общей проверки)
        // =================================================================

        if (type === 'JOIN_ROOM') {
          console.log(`🎯 [HANDLER] JOIN_ROOM entered | roomId="${eventRoomId}", playerId="${playerId}", name="${name}"`)

          const roomId = eventRoomId
          if (!roomId) {
            console.log(`❌ [JOIN_ROOM] Missing roomId`)
            return socket.send(JSON.stringify({ type: 'ERROR', message: 'Room ID required' }))
          }

          // 🔹 ИСПРАВЛЕНО: используем getOrCreateRoom вместо createRoom
          console.log(`🔍 [JOIN_ROOM] Getting or creating room: ${roomId}`)
          const room = await roomManager.getOrCreateRoom(roomId)
          console.log(`✅ [JOIN_ROOM] Room ready: ${roomId}`)

          // 🔹 Вызываем хендлер (он добавит игрока в комнату)
          console.log(`🔗 [JOIN_ROOM] Calling handleJoinRoom...`)
          const result = await handleJoinRoom(room, playerId, name || 'Player', socket, roomManager)
          console.log(`✅ [JOIN_ROOM] handleJoinRoom result:`, result)

          // 🔹 Если сервер сгенерировал новый playerId — отправляем клиенту
          if (result.success && result.playerId && result.playerId !== playerId) {
            console.log(`📤 [JOIN_ROOM] Sending MY_ID: ${result.playerId}`)
            socket.send(JSON.stringify({
              type: 'MY_ID',
              playerId: result.playerId,
              roomId,
              name: name || 'Player'
            }))
          }
          console.log(`✅ [JOIN_ROOM] DONE, returning`)
          return  // 🔹 КРИТИЧНО: выходим, чтобы не шла общая проверка комнаты
        }

        // =================================================================
        // 🔍 ТЕПЕРЬ ПРОВЕРЯЕМ КОМНАТУ (для остальных игровых событий)
        // =================================================================

        console.log(`🔍 [CHECK] Looking for room: eventRoomId="${eventRoomId}", playerId="${playerId}"`)
        let room = roomManager.getRoom(eventRoomId)
        if (!room && playerId) {
          room = Array.from(roomManager.activeRooms.values()).find(r => r.getPlayer(playerId))
          if (room) console.log(`🔍 [CHECK] Found room by playerId: ${room.id}`)
        }

        if (!room) {
          console.log(`❌ [CHECK] No room found, sending ERROR`)
          return socket.send(JSON.stringify({ type: 'ERROR', message: 'Комната не найдена или игрок не подключен' }))
        }
        console.log(`✅ [CHECK] Room found: ${room.id}, status: ${room.state.status}`)

        // =================================================================
        // 🎮 ОСТАЛЬНЫЕ ИГРОВЫЕ СОБЫТИЯ (требуют существующую комнату)
        // =================================================================

        const views = roomManager.getAllRoomViews()
        let handlerRes: any

        if (type === 'START_GAME') {
          console.log(`🎯 [HANDLER] START_GAME`)
          if (room.state.players[0]?.id !== playerId) return socket.send(JSON.stringify({ type: 'ERROR', message: 'Только создатель' }))
          if (room.state.status !== 'LOBBY' || room.playerCount < 2) return socket.send(JSON.stringify({ type: 'ERROR', message: 'Нужно 2+ игрока' }))
          const allReady = room.state.players.every(p => p.isReady || p.id === room.state.players[0]?.id)
          if (!allReady) return socket.send(JSON.stringify({ type: 'ERROR', message: 'Не все игроки нажали "Готов"' }))
          room.startGame()
          broadcastLobbyUpdate()
          room.broadcastState()
          return
        }

        if (type === 'SET_READY') {
          console.log(`🎯 [HANDLER] SET_READY`)
          const p = room.getPlayer(playerId)
          if (p) {
            p.isReady = event.isReady !== false
            broadcastLobbyUpdate()
            room.broadcastState()
          }
          return
        }

        if (type === 'ROLL_DICE') {
          console.log(`🎯 [HANDLER] ROLL_DICE`)
          if (!room.getPlayer(playerId)) return socket.send(JSON.stringify({ type: 'ERROR', message: 'Not in room' }))
          handlerRes = handleRollDice(room, playerId, views, event.targetSpaceId)
        }
        else if (type === 'BUY_PROPERTY') {
          console.log(`🎯 [HANDLER] BUY_PROPERTY`)
          if (!room.getPlayer(playerId)) return socket.send(JSON.stringify({ type: 'ERROR', message: 'Not in room' }))
          handlerRes = handleBuyProperty(room, playerId, Number(spaceId), views)
        }
        else if (type === 'PASS_ACTION') {
          console.log(`🎯 [HANDLER] PASS_ACTION`)
          if (!room.getPlayer(playerId)) return socket.send(JSON.stringify({ type: 'ERROR', message: 'Not in room' }))
          handlerRes = handlePassAction(room, playerId, views)
        }
        else if (type === 'BANKRUPTCY') {
          console.log(`🎯 [HANDLER] BANKRUPTCY`)
          if (!room.getPlayer(playerId)) return socket.send(JSON.stringify({ type: 'ERROR', message: 'Not in room' }))
          handlerRes = handleBankruptcy(room, playerId, views)
        }
        else if (type === 'PAY_JAIL_FINE' || type === 'USE_JAIL_CARD') {
          console.log(`🎯 [HANDLER] JAIL action`)
          if (!room.getPlayer(playerId)) return socket.send(JSON.stringify({ type: 'ERROR', message: 'Not in room' }))
          handlerRes = type === 'PAY_JAIL_FINE'
            ? handlePayJailFine(room, playerId, views)
            : useJailCard(room, playerId, views)
        }
        else if (type === 'BUY_HOUSE') {
          console.log(`🎯 [HANDLER] BUY_HOUSE`)
          if (!room.getPlayer(playerId)) return socket.send(JSON.stringify({ type: 'ERROR', message: 'Not in room' }))
          handlerRes = handleBuyHouse(room, playerId, Number(spaceId), views)
        }
        else if (type === 'SELL_HOUSE') {
          console.log(`🎯 [HANDLER] SELL_HOUSE`)
          if (!room.getPlayer(playerId)) return socket.send(JSON.stringify({ type: 'ERROR', message: 'Not in room' }))
          handlerRes = handleSellHouse(room, playerId, Number(spaceId), views)
        }
        else if (type === 'TRADE_INIT') {
          console.log(`🎯 [HANDLER] TRADE_INIT`)
          if (!room.getPlayer(playerId)) return socket.send(JSON.stringify({ type: 'ERROR', message: 'Not in room' }))
          handlerRes = handleTradeInit(room, playerId, event.responder, views)
        }
        else if (type === 'TRADE_EDIT') {
          console.log(`🎯 [HANDLER] TRADE_EDIT`)
          if (!room.getPlayer(playerId)) return socket.send(JSON.stringify({ type: 'ERROR', message: 'Not in room' }))
          handlerRes = handleTradeEdit(room, playerId, event.side, event.offer, views)
        }
        else if (type === 'TRADE_PROPOSE') {
          console.log(`🎯 [HANDLER] TRADE_PROPOSE`)
          if (!room.getPlayer(playerId)) return socket.send(JSON.stringify({ type: 'ERROR', message: 'Not in room' }))
          handlerRes = handleTradePropose(room, playerId, views)
        }
        else if (type === 'TRADE_ACCEPT') {
          console.log(`🎯 [HANDLER] TRADE_ACCEPT`)
          if (!room.getPlayer(playerId)) return socket.send(JSON.stringify({ type: 'ERROR', message: 'Not in room' }))
          handlerRes = handleTradeAccept(room, playerId, views)
        }
        else if (type === 'TRADE_DECLINE') {
          console.log(`🎯 [HANDLER] TRADE_DECLINE`)
          if (!room.getPlayer(playerId)) return socket.send(JSON.stringify({ type: 'ERROR', message: 'Not in room' }))
          handlerRes = handleTradeDecline(room, playerId, views)
        }
        else if (type === 'MORTGAGE_PROPERTY') {
          console.log(`🎯 [HANDLER] MORTGAGE_PROPERTY`)
          if (!room.getPlayer(playerId)) return socket.send(JSON.stringify({ type: 'ERROR', message: 'Not in room' }))
          handlerRes = handleMortgage(room, playerId, Number(event.spaceId), views)
        }
        else if (type === 'UNMORTGAGE_PROPERTY') {
          console.log(`🎯 [HANDLER] UNMORTGAGE_PROPERTY`)
          if (!room.getPlayer(playerId)) return socket.send(JSON.stringify({ type: 'ERROR', message: 'Not in room' }))
          handlerRes = handleUnmortgage(room, playerId, Number(event.spaceId), views)
        }

        if (handlerRes?.error) {
          console.log(`❌ [HANDLER] Error: ${handlerRes.error}`)
          socket.send(JSON.stringify({ type: 'ERROR', message: handlerRes.error }))
        }

        // 📡 Лайв-фид для админов
        if (socket.isAdmin) {
          socket.send(JSON.stringify({ type: 'ADMIN_EVENT', ts: Date.now(), event: { type, data: event } }))
        }

      } catch (e: any) {
        console.error(`💥 [EV] CRASH: ${e?.message}`)
        console.error(e?.stack)
        socket.send(JSON.stringify({ type: 'ERROR', message: `Server error: ${e?.message}` }))
      }
    })

    // 🔹 Закрытие сокета
    socket.on('close', () => {
      console.log(`🔌 [WS] Closed: playerId=${(socket as any).playerId}`)
      allSockets.delete(socket)
      const pid = (socket as any).playerId

      if (pid) {
        const room = Array.from(roomManager.activeRooms.values()).find(r => r.getPlayer(pid))
        if (room) {
          room.removeSocket(pid)
          if (room.sockets.size === 0 && room.state.status === 'LOBBY') {
            roomManager.removeRoom(room.id)
            broadcastLobbyUpdate()
          } else {
            room.broadcastState()
          }
        }
      }
      broadcastLobbyUpdate()
    })
  })
})

// 🔹 4. Запуск сервера
fastify.listen({ port: 3000, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    console.error(err)
    process.exit(1)
  }
  console.log(`🚀 Server ready: ${address}/ws`)
  console.log(`🔐 Admin API: http://localhost:3000/admin/*`)
})