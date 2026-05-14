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

// 🔹 1. Плагины
fastify.register(fastifyCors, { origin: '*' })
fastify.register(fastifyWebsocket)

// 🔹 2. REST-роуты админки
registerAdminRoutes(fastify)

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

    // 🔑 Пробуем достать токен из query-параметров (для админки/восстановления сессии)
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
        const { type, playerId, name, roomId: eventRoomId, spaceId, email, nickname, password } = event

        // 🚫 Блокируем строку "null" как playerId
        if (playerId && playerId === 'null') {
          return socket.send(JSON.stringify({ type: 'ERROR', message: 'Invalid session. Please refresh.' }))
        }

        console.log(`\n📥 [EV] INCOMING: ${type} | Player: ${playerId || 'anon'} | Room: ${eventRoomId}`)

        // 🔐 ПУБЛИЧНЫЕ: Авторизация
        if (type === 'REGISTER') {
          const res = await handleRegister(email, nickname, password)
          socket.send(JSON.stringify(res.error ? { type: 'ERROR', message: res.error } : { type: 'AUTH_SUCCESS', ...res }))
          return
        }
        if (type === 'LOGIN') {
          const res = await handleLogin(email, password)
          socket.send(JSON.stringify(res.error ? { type: 'ERROR', message: res.error } : { type: 'AUTH_SUCCESS', ...res }))
          const response = res.error
            ? { type: 'ERROR', message: res.error }
            : { type: 'AUTH_SUCCESS', ...res }

          console.log(`📤 [EV] Sending response:`, response.type)
          socket.send(JSON.stringify(response))
          return
        }

        // 🛡 АДМИН: Подписка на лайв-фид
        if (type === 'ADMIN_SUBSCRIBE') {
          const payload = verifyToken(event.token || (socket as any).token)
          if (payload?.role === 'admin') {
            socket.isAdmin = true
            socket.send(JSON.stringify({ type: 'ADMIN_SUBSCRIBED' }))
          } else {
            socket.send(JSON.stringify({ type: 'ERROR', message: 'Admin access required' }))
          }
          return
        }

        // 🔍 Определение комнаты
        let room = roomManager.getRoom(eventRoomId)
        if (!room && playerId) {
          room = Array.from(roomManager.activeRooms.values()).find(r => r.getPlayer(playerId))
        }
        if (!room && type !== 'JOIN_ROOM') {
          return socket.send(JSON.stringify({ type: 'ERROR', message: 'Комната не найдена или игрок не подключен' }))
        }

        // 📊 Лог контекста
        if (room) {
          console.log(`📊 [CTX] Turn: ${room.state.currentTurn} | Pending: ${room.state.actionPending} | Status: ${room.state.status}`)
        }

        // 🎮 ИГРОВЫЕ СОБЫТИЯ
        if (type === 'JOIN_ROOM') {
          const pid = playerId || (socket as any).playerId
          if (!pid || !eventRoomId) return socket.send(JSON.stringify({ type: 'ERROR', message: 'No playerId or roomId' }))

          room = await roomManager.getOrCreateRoom(eventRoomId)

          // 🔑 1. Если игрок с таким ID уже есть → просто обновляем сокет (реконнект)
          let player = room.getPlayer(pid)
          if (player) {
            room.addSocket(player.id, socket)
            ;(socket as any).playerId = player.id
            socket.send(JSON.stringify({ type: 'MY_ID', playerId: player.id, roomId: room.id }))
            room.broadcastState()
            return
          }

          // 🔑 2. Защита от дублей по имени (разные табы с одним аккаунтом)
          if (room.state.players.some(p => p.name === name)) {
            return socket.send(JSON.stringify({ type: 'ERROR', message: 'Игрок с таким именем уже в комнате' }))
          }

          // 🔑 3. Создаём нового игрока
          player = room.addPlayer({ id: pid, name: name || `Player_${pid.slice(-4)}`, color: room.getNextColor(), pos: 0, money: 1500, mortgaged: [] })
          room.addSocket(player.id, socket)
          ;(socket as any).playerId = player.id
          room.addLog(`👤 ${player.name} присоединился`)

          broadcastLobbyUpdate()
          socket.send(JSON.stringify({ type: 'MY_ID', playerId: player.id, roomId: room.id }))
          room.broadcastState()
          return
        }

        if (type === 'START_GAME') {
          if (!room) return
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
          if (!room || room.state.status !== 'LOBBY') return

          const p = room.getPlayer(playerId)
          if (p) {
            p.isReady = event.isReady !== false
            broadcastLobbyUpdate()      // Обновляет список лобби
            room.broadcastState()       // 🔑 КРИТИЧНО: Рассылает isReady всем в комнате!
          }
          return
        }

        if (type === 'GET_LOBBY') { broadcastLobbyUpdate(socket); return }

        // 🔹 Маршрутизация игровых хендлеров
        const views = roomManager.getAllRoomViews()
        let handlerRes: any

        if (type === 'ROLL_DICE') handlerRes = handleRollDice(room, playerId, views, event.targetSpaceId)
        else if (type === 'BUY_PROPERTY') handlerRes = handleBuyProperty(room, playerId, Number(spaceId), views)
        else if (type === 'PASS_ACTION') handlerRes = handlePassAction(room, playerId, views)
        else if (type === 'BANKRUPTCY') handlerRes = handleBankruptcy(room, playerId, views)
        else if (type === 'PAY_JAIL_FINE' || type === 'USE_JAIL_CARD') {
          handlerRes = type === 'PAY_JAIL_FINE' ? handlePayJailFine(room, playerId, views) : useJailCard(room, playerId, views)
        }
        else if (type === 'BUY_HOUSE') handlerRes = handleBuyHouse(room, playerId, Number(spaceId), views)
        else if (type === 'SELL_HOUSE') handlerRes = handleSellHouse(room, playerId, Number(spaceId), views)
        else if (type === 'TRADE_INIT') handlerRes = handleTradeInit(room, playerId, event.responder, views)
        else if (type === 'TRADE_EDIT') handlerRes = handleTradeEdit(room, playerId, event.side, event.offer, views)
        else if (type === 'TRADE_PROPOSE') handlerRes = handleTradePropose(room, playerId, views)
        else if (type === 'TRADE_ACCEPT') handlerRes = handleTradeAccept(room, playerId, views)
        else if (type === 'TRADE_DECLINE') handlerRes = handleTradeDecline(room, playerId, views)
        else if (type === 'MORTGAGE_PROPERTY') handlerRes = handleMortgage(room, playerId, Number(event.spaceId), views)
        else if (type === 'UNMORTGAGE_PROPERTY') handlerRes = handleUnmortgage(room, playerId, Number(event.spaceId), views)

        if (handlerRes?.error) {
          socket.send(JSON.stringify({ type: 'ERROR', message: handlerRes.error }))
        }

        // 📡 Лайв-фид для админов
        if (socket.isAdmin) {
          socket.send(JSON.stringify({ type: 'ADMIN_EVENT', ts: Date.now(), event: { type, data: event } }))
        }

      } catch (e: any) {
        console.error(`💥 [EV] CRASH: ${e?.message}`)
        socket.send(JSON.stringify({ type: 'ERROR', message: `Server error: ${e?.message}` }))
      }
    })

    // 🔹 Закрытие сокета
    socket.on('close', () => {
      allSockets.delete(socket)
      const pid = (socket as any).playerId

      if (pid) {
        // 🔹 Ищем комнату игрока
        const room = Array.from(roomManager.activeRooms.values()).find(r => r.getPlayer(pid))

        if (room) {
          room.removeSocket(pid)

          // 🔹 Если комната пуста И в лобби → удаляем её
          if (room.sockets.size === 0 && room.state.status === 'LOBBY') {
            roomManager.removeRoom(room.id)  // ✅ Теперь метод существует!
            broadcastLobbyUpdate()
          } else {
            room.broadcastState()
          }
        }
      }

      // 🔹 Обновляем лобби для всех
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