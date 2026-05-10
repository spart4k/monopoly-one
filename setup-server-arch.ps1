#!/usr/bin/env pwsh
# setup-server-arch.ps1 — Автоматическая настройка архитектуры сервера
# Запуск: PowerShell (Admin) → cd F:\monopoly → .\setup-server-arch.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host "🏗 Настройка архитектуры сервера..." -ForegroundColor Cyan

# 📁 Создаём структуру папок
$dirs = @(
    "server/src/config",
    "server/src/lib",
    "server/src/schemas",
    "server/src/rooms",
    "server/src/events/handlers",
    "server/src/utils"
)

foreach ($dir in $dirs) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "✅ Создано: $dir" -ForegroundColor Green
    }
}

# 📄 Функция для создания файлов с содержимым
function New-TsFile {
    param([string]$Path, [string]$Content)
    $Content | Out-File -FilePath $Path -Encoding utf8 -Force
    Write-Host "✅ Создано: $Path" -ForegroundColor Green
}

# =============================================================================
# 1️⃣ config/constants.ts
# =============================================================================
New-TsFile -Path "server/src/config/constants.ts" -Content @'
// server/src/config/constants.ts
export const CONSTANTS = {
  COLORS: ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500'] as const,
  STARTING_MONEY: 1500,
  MAX_LOGS: 100,
  SYNC_LOGS_LIMIT: 50,
  BOARD_SIZE: 40,
} as const

export type ColorClass = typeof CONSTANTS.COLORS[number]
'@

# =============================================================================
# 2️⃣ lib/ws-utils.ts
# =============================================================================
New-TsFile -Path "server/src/lib/ws-utils.ts" -Content @'
// server/src/lib/ws-utils.ts
import type { WebSocket } from 'ws'

export type RoomState = {
  status: 'LOBBY' | 'PLAYING' | 'ENDED'
  players: Array<{ id: string; name: string; color: string; pos: number; money: number }>
  currentTurn: string
  logs: string[]
  lastDice: [number, number]
}

export type RoomData = {
  sockets: Map<string, WebSocket>
  state: RoomState
}

// 📡 Рассылка события всем в комнате
export function broadcast(
  rooms: Map<string, RoomData>,
  roomId: string,
  event: any,
  excludeId?: string
) {
  const room = rooms.get(roomId)
  if (!room) return
  const payload = JSON.stringify(event)
  for (const [id, socket] of room.sockets) {
    if (id !== excludeId && socket.readyState === 1) {
      socket.send(payload)
    }
  }
}

// 🎯 Формирует чистый payload для SYNC_STATE
export function buildSyncPayload(state: RoomState) {
  return {
    status: state.status,
    players: state.players,
    currentTurn: state.currentTurn,
    logs: state.logs.slice(-50),
    lastDice: state.lastDice,
  }
}

// 🔄 Рассылает SYNC_STATE всем в комнате
export function syncRoomState(
  rooms: Map<string, RoomData>,
  roomId: string,
  excludeId?: string
) {
  const room = rooms.get(roomId)
  if (!room) return
  broadcast(rooms, roomId, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) }, excludeId)
}
'@

# =============================================================================
# 3️⃣ schemas/client.ts
# =============================================================================
New-TsFile -Path "server/src/schemas/client.ts" -Content @'
// server/src/schemas/client.ts
import { z } from 'zod'

export const ClientEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('JOIN_ROOM'),
    roomId: z.string(),
    playerId: z.string(),
    name: z.string().min(1),
  }),
  z.object({
    type: z.literal('ROLL_DICE'),
    playerId: z.string(),
  }),
  // 👇 Будущие события:
  // z.object({ type: z.literal('BUY_PROPERTY'), playerId: z.string(), propertyId: z.number() }),
  // z.object({ type: z.literal('END_TURN'), playerId: z.string() }),
])

export type ClientEvent = z.infer<typeof ClientEventSchema>
export type ClientEventType = ClientEvent['type']
'@

# =============================================================================
# 4️⃣ schemas/server.ts
# =============================================================================
New-TsFile -Path "server/src/schemas/server.ts" -Content @'
// server/src/schemas/server.ts
import { z } from 'zod'

export const ServerEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('SYNC_STATE'),
    payload: z.object({
      status: z.enum(['LOBBY', 'PLAYING', 'ENDED']),
      players: z.array(z.object({
        id: z.string(),
        name: z.string(),
        color: z.string(),
        pos: z.number(),
        money: z.number(),
      })),
      currentTurn: z.string(),
      logs: z.array(z.string()),
      lastDice: z.tuple([z.number(), z.number()]),
    }),
  }),
  z.object({
    type: z.literal('PLAYER_MOVED'),
    playerId: z.string(),
    from: z.number(),
    to: z.number(),
    dice: z.tuple([z.number(), z.number()]),
  }),
  z.object({
    type: z.literal('ERROR'),
    message: z.string(),
  }),
  // 👇 Будущие события:
  // z.object({ type: z.literal('PROPERTY_BOUGHT'), playerId: z.string(), propertyId: z.number(), price: z.number() }),
])

export type ServerEvent = z.infer<typeof ServerEventSchema>
export type ServerEventType = ServerEvent['type']
'@

# =============================================================================
# 5️⃣ rooms/Room.ts
# =============================================================================
New-TsFile -Path "server/src/rooms/Room.ts" -Content @'
// server/src/rooms/Room.ts
import type { WebSocket } from 'ws'
import { CONSTANTS } from '../config/constants'

export type Player = {
  id: string
  name: string
  color: string
  pos: number
  money: number
}

export type RoomState = {
  status: 'LOBBY' | 'PLAYING' | 'ENDED'
  players: Player[]
  currentTurn: string
  logs: string[]
  lastDice: [number, number]
}

export class Room {
  public state: RoomState
  private sockets = new Map<string, WebSocket>()

  constructor(public id: string) {
    this.state = {
      status: 'LOBBY',
      players: [],
      currentTurn: '',
      logs: ['🏠 Комната создана'],
      lastDice: [1, 1],
    }
  }

  // 👥 Игроки
  getPlayer(id: string): Player | undefined {
    return this.state.players.find(p => p.id === id)
  }

  get playerCount(): number {
    return this.state.players.length
  }

  getNextColor(): string {
    return CONSTANTS.COLORS[this.state.players.length % CONSTANTS.COLORS.length]
  }

  addPlayer(player: Omit<Player, 'color'> & { color?: string }): Player {
    const newPlayer: Player = {
      ...player,
      color: player.color || this.getNextColor(),
    }
    this.state.players.push(newPlayer)
    return newPlayer
  }

  removePlayer(playerId: string): boolean {
    const idx = this.state.players.findIndex(p => p.id === playerId)
    if (idx === -1) return false
    this.state.players.splice(idx, 1)
    return true
  }

  // 🔌 Сокеты
  getSockets(): Map<string, WebSocket> {
    return new Map(this.sockets)
  }

  addSocket(playerId: string, socket: WebSocket): void {
    this.sockets.set(playerId, socket)
  }

  removeSocket(playerId: string): void {
    this.sockets.delete(playerId)
  }

  getSocket(playerId: string): WebSocket | undefined {
    return this.sockets.get(playerId)
  }

  // 📝 Логи
  addLog(message: string): void {
    this.state.logs.push(message)
    if (this.state.logs.length > CONSTANTS.MAX_LOGS) {
      this.state.logs.shift()
    }
  }

  // 🎮 Игра
  startGame(): boolean {
    if (this.state.players.length < 2) return false
    this.state.status = 'PLAYING'
    this.state.currentTurn = this.state.players[0].id
    this.addLog('🎮 Игра началась!')
    return true
  }

  endGame(winnerId: string): void {
    this.state.status = 'ENDED'
    const winner = this.getPlayer(winnerId)
    this.addLog(`🏆 Победил: ${winner?.name || winnerId}`)
  }

  // 🎲 Ход
  rollDice(playerId: string): {
    success: boolean
    dice?: [number, number]
    from?: number
    error?: string
  } {
    if (this.state.status !== 'PLAYING') {
      return { success: false, error: '🚫 Игра не активна' }
    }
    if (this.state.currentTurn !== playerId) {
      return { success: false, error: '🚫 Не ваш ход' }
    }
    const player = this.getPlayer(playerId)
    if (!player) return { success: false, error: '🚫 Игрок не найден' }

    const dice: [number, number] = [
      Math.ceil(Math.random() * 6),
      Math.ceil(Math.random() * 6),
    ]
    this.state.lastDice = dice

    const from = player.pos
    player.pos = (from + dice[0] + dice[1]) % CONSTANTS.BOARD_SIZE

    this.addLog(`🎲 ${player.name}: ${dice[0]}+${dice[1]} → ${player.pos}`)

    // Передаём ход
    const idx = this.state.players.findIndex(p => p.id === playerId)
    this.state.currentTurn = this.state.players[(idx + 1) % this.state.players.length]?.id || ''

    return { success: true, dice, from }
  }
}
'@

# =============================================================================
# 6️⃣ rooms/RoomManager.ts
# =============================================================================
New-TsFile -Path "server/src/rooms/RoomManager.ts" -Content @'
// server/src/rooms/RoomManager.ts
import { Room, type RoomState } from './Room'
import type { WebSocket } from 'ws'

export type RoomView = {
  sockets: Map<string, WebSocket>
  state: RoomState
}

export class RoomManager {
  private rooms = new Map<string, Room>()

  getOrCreateRoom(roomId: string): Room {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Room(roomId))
    }
    return this.rooms.get(roomId)!
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId)
  }

  hasRoom(roomId: string): boolean {
    return this.rooms.has(roomId)
  }

  removeRoom(roomId: string): boolean {
    return this.rooms.delete(roomId)
  }

  listRooms(): string[] {
    return Array.from(this.rooms.keys())
  }

  // Для broadcast: возвращает "публичные" данные комнат
  getAllRoomViews(): Map<string, RoomView> {
    const views = new Map<string, RoomView>()
    for (const [id, room] of this.rooms) {
      views.set(id, {
        sockets: room.getSockets(),
        state: room.state,
      })
    }
    return views
  }
}
'@

# =============================================================================
# 7️⃣ events/handlers/joinRoom.ts
# =============================================================================
New-TsFile -Path "server/src/events/handlers/joinRoom.ts" -Content @'
// server/src/events/handlers/joinRoom.ts
import type { Room } from '../../rooms/Room'
import type { WebSocket } from 'ws'
import type { RoomView } from '../../rooms/RoomManager'
import { broadcast, buildSyncPayload } from '../../lib/ws-utils'

export type JoinRoomResult = { type: 'reconnected' } | { type: 'joined' }

export async function handleJoinRoom(
  room: Room,
  playerId: string,
  playerName: string,
  socket: WebSocket,
  roomViews: Map<string, RoomView>
): Promise<JoinRoomResult> {
  // 🔄 Переподключение существующего игрока
  const existing = room.getPlayer(playerId)
  if (existing) {
    room.addSocket(playerId, socket)
    room.addLog(`🔄 ${playerName} переподключился`)
    // Отправляем стейт только этому игроку
    socket.send(JSON.stringify({
      type: 'SYNC_STATE',
      payload: buildSyncPayload(room.state),
    }))
    return { type: 'reconnected' }
  }

  // 👤 Новый игрок
  room.addPlayer({
    id: playerId,
    name: playerName,
    pos: 0,
    money: 1500,
  })
  room.addLog(`👤 ${playerName} присоединился`)

  // 🎮 Авто-старт при 2+ игроках
  if (room.playerCount >= 2 && room.state.status === 'LOBBY') {
    room.startGame()
  }

  // 📡 Синхронизируем всех
  broadcast(roomViews, room.id, {
    type: 'SYNC_STATE',
    payload: buildSyncPayload(room.state),
  })

  return { type: 'joined' }
}
'@

# =============================================================================
# 8️⃣ events/handlers/rollDice.ts
# =============================================================================
New-TsFile -Path "server/src/events/handlers/rollDice.ts" -Content @'
// server/src/events/handlers/rollDice.ts
import type { Room } from '../../rooms/Room'
import type { RoomView } from '../../rooms/RoomManager'
import { broadcast, buildSyncPayload } from '../../lib/ws-utils'

export type RollDiceResult = { success: true } | { error: string }

export function handleRollDice(
  room: Room,
  playerId: string,
  roomViews: Map<string, RoomView>
): RollDiceResult {
  const result = room.rollDice(playerId)
  if (!result.success) {
    return { error: result.error || 'Неизвестная ошибка' }
  }

  const player = room.getPlayer(playerId)
  if (!player || !result.dice || result.from === undefined) {
    return { error: 'Внутренняя ошибка обработки хода' }
  }

  // 📡 Рассылаем событие движения
  broadcast(roomViews, room.id, {
    type: 'PLAYER_MOVED',
    playerId,
    from: result.from,
    to: player.pos,
    dice: result.dice,
  })

  // 🔄 Синхронизируем полный стейт
  broadcast(roomViews, room.id, {
    type: 'SYNC_STATE',
    payload: buildSyncPayload(room.state),
  })

  return { success: true }
}
'@

# =============================================================================
# 9️⃣ events/handlers/index.ts
# =============================================================================
New-TsFile -Path "server/src/events/handlers/index.ts" -Content @'
// server/src/events/handlers/index.ts
import type { ClientEvent } from '../../schemas/client'
import type { Room } from '../../rooms/Room'
import type { WebSocket } from 'ws'
import type { RoomView } from '../../rooms/RoomManager'
import { handleJoinRoom } from './joinRoom'
import { handleRollDice } from './rollDice'

export type HandlerResult = { error?: string; [key: string]: any }

export async function handleEvent(
  event: ClientEvent,
  room: Room,
  playerId: string | null,
  socket: WebSocket,
  roomViews: Map<string, RoomView>
): Promise<HandlerResult> {
  switch (event.type) {
    case 'JOIN_ROOM':
      return await handleJoinRoom(room, event.playerId, event.name, socket, roomViews)

    case 'ROLL_DICE':
      if (!playerId) return { error: 'Player not authenticated' }
      return handleRollDice(room, playerId, roomViews)

    default:
      return { error: `Неизвестное событие: ${(event as any).type}` }
  }
}
'@

# =============================================================================
# 🔟 utils/errors.ts
# =============================================================================
New-TsFile -Path "server/src/utils/errors.ts" -Content @'
// server/src/utils/errors.ts
export class GameError extends Error {
  constructor(message: string, public code: string = 'GAME_ERROR') {
    super(message)
    this.name = 'GameError'
  }
}

export class ValidationError extends GameError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR')
    this.name = 'ValidationError'
  }
}

export class RoomNotFoundError extends GameError {
  constructor(roomId: string) {
    super(`Комната не найдена: ${roomId}`, 'ROOM_NOT_FOUND')
    this.name = 'RoomNotFoundError'
  }
}

export class PlayerNotFoundError extends GameError {
  constructor(playerId: string) {
    super(`Игрок не найден: ${playerId}`, 'PLAYER_NOT_FOUND')
    this.name = 'PlayerNotFoundError'
  }
}
'@

# =============================================================================
# 1️⃣1️⃣ index.ts (обновлённая точка входа)
# =============================================================================
# Сначала делаем бэкап старого файла
$indexFile = "server/src/index.ts"
if (Test-Path $indexFile) {
  Copy-Item $indexFile "${indexFile}.backup.$(Get-Date -Format 'yyyyMMdd_HHmmss')" -Force
  Write-Host "📦 Бэкап старого index.ts создан" -ForegroundColor Yellow
}

New-TsFile -Path $indexFile -Content @'
// server/src/index.ts — Точка входа (минимум кода, вся логика в модулях)
import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import cors from '@fastify/cors'
import { z } from 'zod'
import { RoomManager } from './rooms/RoomManager'
import { ClientEventSchema } from './schemas/client'
import { handleEvent } from './events/handlers'
import { broadcast, syncRoomState } from './lib/ws-utils'

const fastify = Fastify({ logger: { level: 'info' } })

// Регистрация плагинов
await fastify.register(cors, { origin: true })
await fastify.register(websocket)

const roomManager = new RoomManager()

fastify.get('/ws', { websocket: true }, (connection, req) => {
  if (!connection?.socket) return
  fastify.log.info('🔌 Новое WS-подключение')

  let currentRoomId: string | null = null
  let currentPlayerId: string | null = null

  connection.socket.on('message', async (raw) => {
    try {
      const msg = raw.toString()
      if (msg === 'PING') { connection.socket.send('PONG'); return }

      const event = ClientEventSchema.parse(JSON.parse(msg))

      // 🎯 JOIN_ROOM: создаём/получаем комнату
      if (event.type === 'JOIN_ROOM') {
        currentRoomId = event.roomId
        currentPlayerId = event.playerId
        const room = roomManager.getOrCreateRoom(event.roomId)
        room.addSocket(event.playerId, connection.socket)

        const roomViews = roomManager.getAllRoomViews()
        const result = await handleEvent(event, room, event.playerId, connection.socket, roomViews)
        fastify.log.info(`JOIN_ROOM результат: ${JSON.stringify(result)}`)
        return
      }

      // 🎲 Остальные события требуют привязки к комнате
      if (!currentRoomId || !currentPlayerId) {
        connection.socket.send(JSON.stringify({ type: 'ERROR', message: 'Сначала войдите в комнату' }))
        return
      }

      const room = roomManager.getRoom(currentRoomId)
      if (!room) {
        connection.socket.send(JSON.stringify({ type: 'ERROR', message: 'Комната не найдена' }))
        return
      }

      const roomViews = roomManager.getAllRoomViews()
      const result = await handleEvent(event, room, currentPlayerId, connection.socket, roomViews)

      if (result?.error) {
        connection.socket.send(JSON.stringify({ type: 'ERROR', message: result.error }))
      }

    } catch (err: any) {
      fastify.log.error({ err }, 'Ошибка обработки сообщения')
      try {
        connection.socket.send(JSON.stringify({
          type: 'ERROR',
          message: err instanceof z.ZodError ? '❌ Неверный формат' : 'Серверная ошибка',
        }))
      } catch {}
    }
  })

  connection.socket.on('close', () => {
    if (currentRoomId && currentPlayerId) {
      const room = roomManager.getRoom(currentRoomId)
      if (room) {
        room.removeSocket(currentPlayerId)
        const roomViews = roomManager.getAllRoomViews()
        syncRoomState(roomViews, currentRoomId)
      }
    }
  })

  connection.socket.on('error', (err) =>
    fastify.log.error(`💥 WS ошибка: ${err.message}`)
  )
})

// Запуск сервера
const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' })
    fastify.log.info('🚀 WS сервер готов: ws://0.0.0.0:3000/ws')
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
'@

# =============================================================================
# 📦 Обновляем package.json (добавляем недостающие зависимости)
# =============================================================================
$pkgJson = "server/package.json"
if (Test-Path $pkgJson) {
  $pkg = Get-Content $pkgJson -Raw | ConvertFrom-Json
  $pkg.dependencies.'@fastify/cors' = '^9.0.0'
  $pkg.dependencies.'@fastify/websocket' = '^8.3.1'
  $pkg.dependencies.zod = '^3.24.2'
  $pkg.dependencies.fastify = '^4.29.1'
  $pkg | ConvertTo-Json -Depth 10 | Out-File $pkgJson -Encoding utf8 -Force
  Write-Host "✅ package.json обновлён" -ForegroundColor Green
}

# =============================================================================
# 🎉 Завершение
# =============================================================================
Write-Host "`n🎉 Архитектура сервера создана!" -ForegroundColor Cyan
Write-Host "📁 Структура:" -ForegroundColor Cyan
Write-Host @"
server/src/
├── index.ts              # Точка входа
├── config/
│   └── constants.ts      # Константы
├── lib/
│   └── ws-utils.ts       # Утилиты для WebSocket
├── schemas/
│   ├── client.ts         # Схемы клиентских событий
│   └── server.ts         # Схемы серверных событий
├── rooms/
│   ├── Room.ts           # Класс комнаты
│   └── RoomManager.ts    # Менеджер комнат
├── events/
│   └── handlers/
│       ├── joinRoom.ts   # Обработчик JOIN_ROOM
│       ├── rollDice.ts   # Обработчик ROLL_DICE
│       └── index.ts      # Роутер событий
└── utils/
    └── errors.ts         # Классы ошибок
"@ -ForegroundColor Gray

Write-Host "`n🚀 Следующие шаги:" -ForegroundColor Cyan
Write-Host "1. cd server && pnpm install" -ForegroundColor Yellow
Write-Host "2. pnpm dev" -ForegroundColor Yellow
Write-Host "3. Тестируй подключение и ходы" -ForegroundColor Yellow

Write-Host "`n💡 Совет: если что-то сломается — восстанови бэкап index.ts.backup.*" -ForegroundColor Magenta