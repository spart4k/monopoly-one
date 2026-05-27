import type { WebSocket } from 'ws'
import { CONSTANTS } from '../config/constants'
import { buildSyncPayload, broadcast } from '../lib/ws-utils'
import { saveGameStart, saveGameSnapshot, logGameEvent, saveGameEnd } from '../lib/db'

export type Player = {
  id: string; name: string; color: string; pos: number; money: number
  properties: number[]; mortgaged: number[]; houses: Record<number, number>
  isInJail: boolean; jailTurns: number; jailCards: number; consecutiveDoubles: number
  isReady?: boolean; housesBoughtThisTurn: boolean; isBankrupt: boolean, pendingJail?: boolean
}

export type RoomView = {
  id: string
  state: RoomState
  sockets: Map<string, WebSocket>
}

export type RoomState = {
  status: 'LOBBY' | 'PLAYING' | 'ENDED'
  players: Player[]
  currentTurn: string
  logs: string[]
  lastDice: [number, number]
  actionPending: 'NONE' | 'BUY' | 'CARD' | 'INFO' | 'DOUBLE_TURN'
  lastRollWasDouble: boolean
  activeTrade: any | null
  selectedSpaceId: number | null
  pendingCard: any
  pendingInfo: any
  pendingPayment: { amount: number; creditorId: string | null; type: 'rent' | 'tax' | 'bonus' } | null
  winnerId: string | null
  gameOver: boolean
}

export class Room {
  public state: RoomState
  public sockets = new Map<string, WebSocket>()
  public snapshotInterval: NodeJS.Timeout | null = null
  public onTurnChange?: (turnId: string) => void

  constructor(public id: string, initialState?: Partial<RoomState>) {
    this.state = {
      status: 'LOBBY', players: [], currentTurn: '', logs: ['🏠 Комната создана'],
      lastDice: [1, 1], actionPending: 'NONE', lastRollWasDouble: false,
      activeTrade: null, selectedSpaceId: null, pendingCard: null,
      pendingInfo: null, pendingPayment: null, winnerId: null, gameOver: false,
      ...initialState
    }
  }

  getPlayer(id: string) { return this.state.players.find(p => p.id === id) }
  get playerCount() { return this.state.players.length }
  getSockets() { return this.sockets }
  getNextColor() { return CONSTANTS.COLORS[this.state.players.length % CONSTANTS.COLORS.length] }

  addSocket(pid: string, sock: WebSocket) { this.sockets.set(pid, sock); (sock as any).playerId = pid }
  removeSocket(pid: string) { this.sockets.delete(pid) }

  addPlayer(p: Omit<Player, 'properties' | 'houses' | 'isInJail' | 'jailTurns' | 'jailCards' | 'consecutiveDoubles' | 'isReady' | 'mortgaged' | 'isBankrupt'>) {
    const newP: Player = { ...p, properties: [], houses: {}, mortgaged: [], isInJail: false, jailTurns: 0, jailCards: 0, consecutiveDoubles: 0, housesBoughtThisTurn: false, isReady: this.state.players.length === 0, isBankrupt: false }
    this.state.players.push(newP)
    return newP
  }

  addLog(msg: string) { this.state.logs.push(msg); if (this.state.logs.length > 100) this.state.logs.shift() }
  broadcastState() {
    const payload = buildSyncPayload(this.state)
    for (const [_, sock] of this.sockets) if (sock.readyState === 1) sock.send(JSON.stringify({ type: 'SYNC_STATE', payload }))
  }

  startGame() {
    if (this.state.players.length < 2) return false
    this.state.status = 'PLAYING'
    this.state.currentTurn = this.state.players[0]?.id || ''
    this.state.actionPending = 'NONE'
    this.state.lastRollWasDouble = false
    this.state.gameOver = false
    this.state.winnerId = null
    this.addLog('🎮 Игра началась!')

    // 🔹 SNAPSHOT & DB HOOKS
    this.snapshotInterval = setInterval(() => {
      if (this.state.status === 'PLAYING') saveGameSnapshot(this.id, this.state).catch(console.error)
    }, 30000)
    logGameEvent(this.id, this.state.currentTurn, 'GAME_START', { players: this.state.players.length })
    saveGameStart(this.id, this.state.players[0]?.id).catch(console.error)

    this.broadcastState()
    return true
  }

  finishTurn() {
    const curr = this.getPlayer(this.state.currentTurn)
    if (curr) curr.housesBoughtThisTurn = false
    let nextIdx = (this.state.players.findIndex(p => p.id === this.state.currentTurn) + 1) % this.state.players.length
    let attempts = 0
    while (attempts < this.state.players.length && this.state.players[nextIdx]?.isBankrupt) {
      nextIdx = (nextIdx + 1) % this.state.players.length
      attempts++
    }
    const next = this.state.players[nextIdx]
    this.state.currentTurn = next?.id || ''
    this.state.actionPending = 'NONE'
    this.state.lastRollWasDouble = false
    this.addLog(`🔄 Ход переходит к ${next?.name || '...'}`)
    if (this.onTurnChange) this.onTurnChange(this.state.currentTurn)
    this.broadcastState()
  }

  checkGameOver(): { isOver: boolean; winnerId: string | null } {
    const active = this.state.players.filter(p => !p.isBankrupt)
    if (active.length === 1) return { isOver: true, winnerId: active[0].id }
    if (active.length === 0) return { isOver: true, winnerId: null }
    return { isOver: false, winnerId: null }
  }

  declareBankrupt(playerId: string, roomViews: Map<string, any>) {
    const player = this.getPlayer(playerId)
    if (!player || player.isBankrupt) return
    player.isBankrupt = true
    player.money = 0
    this.addLog(`🏳️ ${player.name} объявил банкротство`)
    logGameEvent(this.id, playerId, 'BANKRUPTCY')

    const { isOver, winnerId } = this.checkGameOver()
    if (isOver) {
      this.state.gameOver = true
      this.state.winnerId = winnerId
      this.state.actionPending = 'NONE'
      this.state.status = 'ENDED'

      if (this.snapshotInterval) clearInterval(this.snapshotInterval)
      const winner = winnerId ? this.getPlayer(winnerId) : null
      this.addLog(`🏆 ${winner?.name || 'Никто'} победил! Игра завершена.`)
      saveGameEnd(this.id, winnerId, this.state).catch(console.error)
      logGameEvent(this.id, winnerId || '', 'GAME_END', { reason: 'bankruptcy' })
      broadcast(roomViews, this.id, { type: 'GAME_OVER', winnerId, winnerName: winner?.name })
    }

    if (this.state.currentTurn === playerId && !isOver) this.finishTurn()
    else this.broadcastState()
  }
}