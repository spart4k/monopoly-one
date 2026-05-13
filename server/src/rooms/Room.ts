// server/src/rooms/Room.ts
import type { WebSocket } from 'ws'
import { CONSTANTS } from '../config/constants'
import { buildSyncPayload } from '../lib/ws-utils'

// 🔑 Типы
export type Player = {
  id: string
  name: string
  color: string
  pos: number
  money: number
  properties: number[]
  mortgaged: number[]
  houses: Record<number, number>
  isInJail: boolean
  jailTurns: number
  jailCards: number
  consecutiveDoubles: number
  isReady?: boolean
  housesBoughtThisTurn: boolean
}

export type RoomState = {
  status: 'LOBBY' | 'PLAYING' | 'ENDED'
  players: Player[]
  currentTurn: string
  logs: string[]
  lastDice: [number, number]
  actionPending: 'NONE' | 'BUY' | 'CARD' | 'INFO' | 'DOUBLE_TURN'
  lastRollWasDouble: boolean
  activeTrade: TradeState | null
  selectedSpaceId: number | null
  pendingCard: any
  pendingInfo: any
  pendingPayment: { amount: number; creditorId: string | null; type: 'rent' | 'tax' } | null
}

export type TradeOffer = { properties: number[], money: number, jailCards: number }
export type TradeState = {
  initiator: string
  responder: string
  from: TradeOffer
  to: TradeOffer
  status: 'draft' | 'proposed'
  lastProposer: string | null
  messages: { from: string, text: string, ts: number }[]
}

export class Room {
  public state: RoomState
  public sockets = new Map<string, WebSocket>()
  public onTurnChange?: (turnId: string) => void

  constructor(public id: string, initialState?: Partial<RoomState>) {
    this.state = {
      status: 'LOBBY',
      players: [],
      currentTurn: '',
      logs: ['🏠 Комната создана'],
      lastDice: [1, 1],
      actionPending: 'NONE',
      lastRollWasDouble: false,
      activeTrade: null,
      selectedSpaceId: null,
      pendingCard: null,
      pendingInfo: null,
      pendingPayment: null,
      ...initialState
    }
  }

  // 🔹 Геттеры
  getPlayer(id: string) { return this.state.players.find(p => p.id === id) }
  getPlayerIdByName(name: string): string | null {
    const player = this.state.players.find(p => p.name === name)
    return player?.id || null
  }
  get playerCount() { return this.state.players.length }
  getNextColor() { return CONSTANTS.COLORS[this.state.players.length % CONSTANTS.COLORS.length] }
  getSockets() { return new Map(this.sockets) }

  // 🔹 Сокеты
  addSocket(pid: string, sock: WebSocket) {
    this.sockets.set(pid, sock)
    ;(sock as any).playerId = pid // 🔑 Запоминаем игрока на сокете
  }
  removeSocket(pid: string) { this.sockets.delete(pid) }

  // 🔹 Игрок
  addPlayer(p: Omit<Player, 'properties' | 'houses' | 'isInJail' | 'jailTurns' | 'jailCards' | 'consecutiveDoubles' | 'isReady' | 'mortgaged'>) {
    const isFirst = this.state.players.length === 0
    const newP: Player = {
      ...p,
      properties: [],
      houses: {},
      mortgaged: [],
      isInJail: false,
      jailTurns: 0,
      jailCards: 0,
      consecutiveDoubles: 0,
      housesBoughtThisTurn: false,
      isReady: isFirst,
    }
    this.state.players.push(newP)
    return newP
  }

  // 🔹 Лог
  addLog(msg: string) {
    this.state.logs.push(msg)
    if (this.state.logs.length > 50) this.state.logs.shift()
  }

  // 🔹 Рассылка состояния всем подключенным в комнате
  broadcastState() {
    const payload = buildSyncPayload(this.state)
    for (const [_, socket] of this.sockets) {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify({ type: 'SYNC_STATE', payload }))
      }
    }
  }

  // 🔹 Старт игры
  startGame() {
    if (this.state.players.length < 2) return false
    this.state.actionPending = 'NONE'
    this.state.lastRollWasDouble = false
    this.state.status = 'PLAYING'
    this.state.currentTurn = this.state.players[0]?.id || ''
    this.addLog('🎮 Игра началась!')
    if (this.state.currentTurn) {
      this.addLog(`🎲 Ход начинает ${this.getPlayer(this.state.currentTurn)?.name}`)
    }
    this.broadcastState()
    return true
  }

  // 🔹 Завершение хода
  finishTurn() {
    // 🔑 Сбрасываем лимит домов для текущего игрока
    const currentPlayer = this.getPlayer(this.state.currentTurn)
    if (currentPlayer) currentPlayer.housesBoughtThisTurn = false

    const idx = this.state.players.findIndex(p => p.id === this.state.currentTurn)
    const nextPlayer = this.state.players[(idx + 1) % this.state.players.length]
    this.state.currentTurn = nextPlayer?.id || ''
    this.state.actionPending = 'NONE'
    this.state.lastRollWasDouble = false
    this.addLog(`🔄 Ход переходит к ${nextPlayer?.name || '...'}`)
    if (this.onTurnChange) this.onTurnChange(this.state.currentTurn)
    this.broadcastState()
  }

  // 🔹 Бросок костей (валидация)
  rollDice(playerId: string) {
    if (this.state.status !== 'PLAYING') return { success: false, error: '🚫 Игра не активна' }
    if (this.state.currentTurn !== playerId) return { success: false, error: '🚫 Не ваш ход' }
    if (this.state.actionPending !== 'NONE' && this.state.actionPending !== 'DOUBLE_TURN') {
      return { success: false, error: '🚫 Сначала завершите действие' }
    }
    const p = this.getPlayer(playerId)
    if (!p) return { success: false, error: '🚫 Игрок не найден' }
    const dice: [number, number] = [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)]
    this.state.lastDice = dice
    return { success: true, dice, from: p.pos }
  }
}