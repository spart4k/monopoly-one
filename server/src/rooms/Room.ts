// server/src/rooms/Room.ts
import type { WebSocket } from 'ws'
import { CONSTANTS } from '../config/constants'

export type Player = {
  id: string
  name: string
  color: string
  pos: number
  money: number
  properties: number[]
  houses: Record<number, number> // 🔑 0-4 дома, 5 отель
  isInJail: boolean
  jailTurns: number
  jailCards: number
  consecutiveDoubles: number
  isReady: boolean
}

export type RoomState = {
  status: 'LOBBY' | 'PLAYING' | 'ENDED'
  players: Player[]
  currentTurn: string
  logs: string[]
  lastDice: [number, number]
  actionPending: 'NONE' | 'BUY' | 'CARD' | 'INFO' | 'DOUBLE_TURN'
  lastRollWasDouble: boolean
}

export class Room {
  public state: RoomState
  public sockets = new Map<string, WebSocket>()
  public onTurnChange?: (turnId: string) => void

  constructor(public id: string, initialState?: Partial<RoomState>) {
    this.state = {
      status: 'LOBBY', players: [], currentTurn: '',
      logs: ['🏠 Комната создана'], lastDice: [1, 1],
      actionPending: 'NONE', lastRollWasDouble: false, ...initialState
    }
  }

  getPlayer(id: string) { return this.state.players.find(p => p.id === id) }
  get playerCount() { return this.state.players.length }
  getNextColor() { return CONSTANTS.COLORS[this.state.players.length % CONSTANTS.COLORS.length] }

  addPlayer(p: Omit<Player, 'properties' | 'houses' | 'isInJail' | 'jailTurns' | 'jailCards' | 'consecutiveDoubles' | 'isReady'>) {
    const isFirst = this.state.players.length === 0
    const newP: Player = {
      ...p, properties: [], houses: {}, isInJail: false, jailTurns: 0, jailCards: 0,
      consecutiveDoubles: 0, isReady: isFirst
    }
    this.state.players.push(newP)
    return newP
  }

  getSockets() { return new Map(this.sockets) }
  addSocket(pid: string, sock: WebSocket) { this.sockets.set(pid, sock) }
  removeSocket(pid: string) { this.sockets.delete(pid) }

  addLog(msg: string) {
    this.state.logs.push(msg)
    if (this.state.logs.length > 50) this.state.logs.shift()
  }

  startGame() {
    if (this.state.players.length < 2) return false
    this.state.actionPending = 'NONE'
    this.state.lastRollWasDouble = false
    this.state.status = 'PLAYING'
    this.state.currentTurn = this.state.players[0].id
    this.addLog('🎮 Игра началась!')
    return true
  }

  finishTurn() {
    const idx = this.state.players.findIndex(p => p.id === this.state.currentTurn)
    const nextPlayer = this.state.players[(idx + 1) % this.state.players.length]
    this.state.currentTurn = nextPlayer?.id || ''
    this.state.actionPending = 'NONE'
    this.state.lastRollWasDouble = false
    this.addLog(`🔄 Ход переходит к ${nextPlayer?.name || '...'}`)
    if (this.onTurnChange) this.onTurnChange(this.state.currentTurn)
  }

  rollDice(playerId: string) {
    if (this.state.status !== 'PLAYING') return { success: false, error: '🚫 Игра не активна' }
    if (this.state.currentTurn !== playerId) return { success: false, error: '🚫 Не ваш ход' }
    if (this.state.actionPending !== 'NONE' && this.state.actionPending !== 'DOUBLE_TURN') return { success: false, error: '🚫 Сначала завершите действие' }
    const p = this.getPlayer(playerId)
    if (!p) return { success: false, error: '🚫 Игрок не найден' }
    const dice: [number, number] = [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)]
    this.state.lastDice = dice
    return { success: true, dice, from: p.pos }
  }
}