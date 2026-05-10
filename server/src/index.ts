// server/src/index.ts — ИСПРАВЛЕННЫЙ: поиск комнаты по playerId
import Fastify from 'fastify'
import fastifyCors from '@fastify/cors'
import fastifyWs from '@fastify/websocket'
import { RoomManager } from './rooms/RoomManager'

const fastify = Fastify({ logger: false })
const roomManager = new RoomManager()

fastify.register(fastifyCors, { origin: '*' })
fastify.register(fastifyWs)

// 🔍 Хелпер: ищем комнату, где есть игрок с таким ID
function findRoomByPlayer(playerId: string): ReturnType<RoomManager['getRoom']> {
  for (const room of roomManager.activeRooms.values()) {
    if (room.getPlayer(playerId)) return room
  }
  return undefined
}

// 🎯 Обработчик событий (исправленная версия)
async function handleEvent(msg: string, socket: any) {
  console.log(`📩 [EV] Received: ${msg.slice(0, 200)}`)

  try {
    const event = JSON.parse(msg)
    const { type, playerId, name, roomId } = event

    let room: ReturnType<RoomManager['getRoom']>

    // 🔑 Для JOIN_ROOM roomId ОБЯЗАТЕЛЕН в сообщении
    // Для остальных событий ищем комнату по playerId
    if (type === 'JOIN_ROOM') {
      if (!roomId) {
        socket.send(JSON.stringify({ type: 'ERROR', message: 'No roomId in JOIN_ROOM' }))
        return
      }
      room = await roomManager.getOrCreateRoom(roomId)
    } else {
      // Для игровых событий: ищем комнату по игроку
      if (!playerId) {
        socket.send(JSON.stringify({ type: 'ERROR', message: 'No playerId' }))
        return
      }
      room = findRoomByPlayer(playerId)
      if (!room) {
        socket.send(JSON.stringify({ type: 'ERROR', message: 'Player not found in any room' }))
        return
      }
    }

    console.log(`🏠 [EV] Room resolved: ${room.id} for ${type}`)

    // 🎯 JOIN_ROOM — логика подключения
    if (type === 'JOIN_ROOM') {
      console.log(`👤 [JOIN] ${name} (${playerId}) in ${roomId}`)

      let player = room.getPlayer(playerId)
      if (!player) {
        player = room.addPlayer({
          id: playerId,
          name: name,
          color: room.getNextColor(),
          pos: 0,
          money: 1500
        })
        room.addLog(`👤 ${name} присоединился`)
        console.log(`✅ [JOIN] New player: ${name}`)
      }

      room.addSocket(playerId, socket)
      console.log(`🔗 [JOIN] Socket bound`)

      if (room.state.status === 'LOBBY' && room.playerCount >= 2) {
        room.startGame()
        console.log(`🎮 [JOIN] Game started!`)
      }

      const payload = {
        status: room.state.status,
        players: room.state.players.map((p: any) => ({
          id: p.id, name: p.name, color: p.color, pos: p.pos,
          money: p.money, properties: p.properties,
          isInJail: p.isInJail, jailTurns: p.jailTurns,
          jailCards: p.jailCards, consecutiveDoubles: p.consecutiveDoubles
        })),
        currentTurn: room.state.currentTurn,
        logs: room.state.logs,
        lastDice: room.state.lastDice
      }

      const response = JSON.stringify({ type: 'SYNC_STATE', payload })
      console.log(`📤 [JOIN] Sending SYNC_STATE (${response.length} bytes)`)

      if (socket.readyState === 1) {
        socket.send(response)
        console.log(`✅ [JOIN] Sent successfully`)
      }
      return
    }

    // 🎲 ROLL_DICE — делегируем в хендлер
    if (type === 'ROLL_DICE') {
      console.log(`🎲 [EV] Delegating ROLL_DICE for ${playerId}`)
      // Импортируем здесь, чтобы избежать циклических зависимостей
      const { handleRollDice } = await import('./events/handlers/rollDice')
      const roomViews = roomManager.getAllRoomViews()
      const result = handleRollDice(room, playerId, roomViews)
      if (result?.error) {
        console.warn(`⚠️ [ROLL] Error: ${result.error}`)
        socket.send(JSON.stringify({ type: 'ERROR', message: result.error }))
      }
      return
    }

    // 🏠 BUY_PROPERTY
    if (type === 'BUY_PROPERTY') {
      console.log(`🏠 [EV] Delegating BUY_PROPERTY for ${playerId}`)
      const { handleBuyProperty } = await import('./events/handlers/buyProperty')
      const roomViews = roomManager.getAllRoomViews()
      const result = handleBuyProperty(room, playerId, event.spaceId, roomViews)
      if (result?.error) {
        socket.send(JSON.stringify({ type: 'ERROR', message: result.error }))
      }
      return
    }

    // ⏭ PASS_ACTION
    if (type === 'PASS_ACTION') {
      console.log(`⏭ [EV] Delegating PASS_ACTION for ${playerId}`)
      const { handlePassAction } = await import('./events/handlers/buyProperty')
      const roomViews = roomManager.getAllRoomViews()
      const result = handlePassAction(room, playerId, roomViews)
      if (result?.error) {
        socket.send(JSON.stringify({ type: 'ERROR', message: result.error }))
      }
      return
    }

    // Остальные события можно добавить по аналогии
    console.log(`⏭ [EV] ${type} not handled yet`)

  } catch (e) {
    console.error(`💥 [EV] Handler error:`, e)
    socket.send(JSON.stringify({ type: 'ERROR', message: 'Server error' }))
  }
}

fastify.register(async (server) => {
  server.get('/ws', { websocket: true }, (connection, req) => {
    const socket = connection.socket
    console.log(`🔌 [WS] Connected from ${req.socket.remoteAddress}`)

    socket.on('message', async (raw) => {
      let msg = ''
      if (raw instanceof Buffer) {
        msg = raw.toString('utf8')
      } else if (typeof raw === 'string') {
        msg = raw
      } else {
        console.log(`❓ [WS] Unknown message type: ${typeof raw}`)
        return
      }
      await handleEvent(msg, socket)
    })

    socket.on('close', () => console.log(`🔌 [WS] Closed`))
    socket.on('error', (e) => console.error(`💥 [WS] Error:`, e))
  })
})

async function start() {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' })
    console.log('🚀 Server ready: ws://0.0.0.0:3000/ws')
  } catch (err) {
    console.error('💥 Startup error:', err)
    process.exit(1)
  }
}

start()