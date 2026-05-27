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
        const { type, playerId, name, roomId: eventRoomId, nickname } = event

        console.log(`📥 [EV] INCOMING: ${type} | Player: ${playerId || 'anon'} | Room: ${eventRoomId}`)

        // =================================================================
        // 🔥 ПУБЛИЧНЫЕ СОБЫТИЯ — ОБРАБАТЫВАЕМ ПЕРВЫМИ, БЕЗ ПРОВЕРКИ КОМНАТЫ
        // =================================================================

        // 🔹 1. Регистрация ника (главное!)
        // 🔹 1. Регистрация ника (главное!) — С ОТЛАДКОЙ
        console.log(`🔍 [DEBUG] type="${type}", length=${type?.length}, charCodes=[${Array.from(type||'').map(c=>c.charCodeAt(0))}]`)

        if (type === 'SET_NICKNAME') {
          console.log(`🎯 [DEBUG] ✅ MATCH! Entering SET_NICKNAME handler`)

          const nick = nickname?.trim()
          console.log(`🔍 [DEBUG] nickname="${nickname}", trimmed="${nick}"`)

          if (!nick || nick.length < 2 || nick.length > 20) {
            console.log(`❌ [DEBUG] Nick validation failed`)
            return socket.send(JSON.stringify({ type: 'ERROR', message: 'Ник от 2 до 20 символов' }))
          }
          if (!/^[\w\s\u0400-\u04FF\-]+$/u.test(nick)) {
            console.log(`❌ [DEBUG] Nick regex failed`)
            return socket.send(JSON.stringify({ type: 'ERROR', message: 'Только буквы, цифры, пробелы и -' }))
          }

          const norm = nick.toLowerCase()
          const isTaken = Array.from(guestRegistry.keys()).some(n => n.toLowerCase() === norm) ||
            Array.from(roomManager.activeRooms.values()).some(r =>
              r.state.players.some(p => p.name.toLowerCase() === norm)
            )

          if (isTaken) {
            console.log(`❌ [DEBUG] Nick "${nick}" is taken`)
            return socket.send(JSON.stringify({ type: 'ERROR', message: 'Этот ник уже занят' }))
          }

          const newPlayerId = `p_${Math.random().toString(36).substring(2, 10)}`
          guestRegistry.set(norm, newPlayerId)
          socket.playerId = newPlayerId
          socket.nickname = nick

          console.log(`✅ [AUTH] Guest: ${nick} -> ${newPlayerId}`)
          socket.send(JSON.stringify({ type: 'NICKNAME_ACCEPTED', playerId: newPlayerId, nickname: nick }))
          return  // 🔹 КРИТИЧНО: выходим
        } else {
          console.log(`❌ [DEBUG] NO MATCH! type="${type}" !== "SET_NICKNAME"`)
        }

        // 🔹 2. Запрос лобби (публичный)
        if (type === 'GET_LOBBY') {
          broadcastLobbyUpdate(socket)
          return
        }

        // 🔹 3. Авторизация (если есть)
        if (type === 'REGISTER' || type === 'LOGIN') {
          // ... твой код ...
          return
        }

        // =================================================================
        // 🔍 ТЕПЕРЬ ПРОВЕРЯЕМ КОМНАТУ (только для игровых событий)
        // =================================================================
        console.log(`🔍 [DEBUG] Checking room for event: ${type}`)
        let room = roomManager.getRoom(eventRoomId)
        if (!room && playerId) {
          room = Array.from(roomManager.activeRooms.values()).find(r => r.getPlayer(playerId))
        }

        if (!room) {
          return socket.send(JSON.stringify({ type: 'ERROR', message: 'Комната не найдена или игрок не подключен' }))
        }

        // =================================================================
        // 🎮 ИГРОВЫЕ СОБЫТИЯ (требуют комнату)
        // =================================================================

        if (type === 'JOIN_ROOM') {
          const { roomId, playerId, name } = event
          const room = roomManager.getRoom(roomId)
          if (!room) return socket.send(JSON.stringify({ type: 'ERROR', message: 'Комната не найдена' }))

          const result = await handleJoinRoom(room, playerId, name || 'Player', socket, roomManager)
          if (result.success && result.playerId && result.playerId !== playerId) {
            socket.send(JSON.stringify({ type: 'MY_ID', playerId: result.playerId, roomId, name: name || 'Player' }))
          }
          return
        }

        // ... остальные хендлеры (START_GAME, ROLL_DICE и т.д.) ...

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