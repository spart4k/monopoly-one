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
import { handleJoinRoom } from './events/handlers/joinRoom'  // 🔹 Импорт хендлера

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

        // =================================================================
        // 🔐 ПУБЛИЧНЫЕ СОБЫТИЯ (НЕ ТРЕБУЮТ КОМНАТЫ И ИГРОКА)
        // =================================================================

        // 🔹 Гостевая регистрация по нику
        if (type === 'SET_NICKNAME') {
          const nick = nickname?.trim()
          if (!nick || nick.length < 2 || nick.length > 20) {
            return socket.send(JSON.stringify({ type: 'ERROR', message: 'Ник от 2 до 20 символов' }))
          }
          if (!/^[\w\s\u0400-\u04FF\-]+$/u.test(nick)) {
            return socket.send(JSON.stringify({ type: 'ERROR', message: 'Только буквы, цифры, пробелы и -' }))
          }

          const norm = nick.toLowerCase()
          // 🔹 Проверяем уникальность
          const isTaken = Array.from(guestRegistry.keys()).some(n => n.toLowerCase() === norm) ||
            Array.from(roomManager.activeRooms.values()).some(r =>
              r.state.players.some(p => p.name.toLowerCase() === norm)
            )

          if (isTaken) {
            return socket.send(JSON.stringify({ type: 'ERROR', message: 'Этот ник уже занят' }))
          }

          // 🔹 Генерируем ID и сохраняем
          const newPlayerId = `p_${Math.random().toString(36).substring(2, 10)}`
          guestRegistry.set(norm, newPlayerId)
          socket.playerId = newPlayerId  // 🔹 Привязываем к сокету
          socket.nickname = nick

          console.log(`✅ [AUTH] Guest registered: ${nick} -> ${newPlayerId}`)
          socket.send(JSON.stringify({ type: 'NICKNAME_ACCEPTED', playerId: newPlayerId, nickname: nick }))
          return  // 🔹 ВАЖНО: return, чтобы не шла проверка комнаты
        }

        // 🔹 Авторизация (опционально)
        if (type === 'REGISTER') {
          const res = await handleRegister(email, nickname, password)
          socket.send(JSON.stringify(res.error ? { type: 'ERROR', message: res.error } : { type: 'AUTH_SUCCESS', ...res }))
          return
        }
        if (type === 'LOGIN') {
          const res = await handleLogin(email, password)
          socket.send(JSON.stringify(res.error ? { type: 'ERROR', message: res.error } : { type: 'AUTH_SUCCESS', ...res }))
          return
        }

        // 🔹 Запрос лобби (публичный)
        if (type === 'GET_LOBBY') {
          broadcastLobbyUpdate(socket)
          return  // 🔹 return, чтобы не шла проверка комнаты
        }

        // 🔹 Админ-подписка
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

        // =================================================================
        // 🔍 ПРОВЕРКА КОМНАТЫ (ТОЛЬКО ДЛЯ ИГРОВЫХ СОБЫТИЙ)
        // =================================================================

        let room = roomManager.getRoom(eventRoomId)
        if (!room && playerId) {
          room = Array.from(roomManager.activeRooms.values()).find(r => r.getPlayer(playerId))
        }

        // 🔹 Если комнаты нет И это не публичное событие → ошибка
        if (!room) {
          return socket.send(JSON.stringify({ type: 'ERROR', message: 'Комната не найдена или игрок не подключен' }))
        }

        // 📊 Лог контекста
        console.log(`📊 [CTX] Turn: ${room.state.currentTurn} | Pending: ${room.state.actionPending} | Status: ${room.state.status}`)

        // =================================================================
        // 🎮 ИГРОВЫЕ СОБЫТИЯ (требуют комнату)
        // =================================================================

        // 🔹 Присоединение к комнате
        if (type === 'JOIN_ROOM') {
          const { roomId, playerId, name } = event
          const room = roomManager.getRoom(roomId)
          if (!room) {
            return socket.send(JSON.stringify({ type: 'ERROR', message: 'Комната не найдена' }))
          }

          const result = await handleJoinRoom(room, playerId, name || 'Player', socket, roomManager)

          if (result.success && result.playerId && result.playerId !== playerId) {
            socket.send(JSON.stringify({
              type: 'MY_ID',
              playerId: result.playerId,
              roomId,
              name: name || 'Player'
            }))
          }
          return
        }

        // 🔹 Остальные игровые события (START_GAME, ROLL_DICE и т.д.)
        // ... твой существующий код ...

        const views = roomManager.getAllRoomViews()
        let handlerRes: any

        if (type === 'START_GAME') {
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
          const p = room.getPlayer(playerId)
          if (p) {
            p.isReady = event.isReady !== false
            broadcastLobbyUpdate()
            room.broadcastState()
          }
          return
        }

        // ... остальные хендлеры (ROLL_DICE, BUY_PROPERTY и т.д.) ...

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
            roomManager.removeRoom(room.id)
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