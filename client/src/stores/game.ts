// client/src/stores/game.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type Player = {
  id: string
  name: string
  color: string
  pos: number
  money: number
  properties: number[]
  houses: Record<number, number>
  mortgaged: number[]
  isInJail: boolean
  jailTurns: number
  jailCards: number
  consecutiveDoubles: number
  housesBoughtThisTurn: boolean
  isReady: boolean
  isBankrupt: boolean
}

export type GameState = {
  status: 'LOBBY' | 'PLAYING' | 'ENDED'
  players: Player[]
  currentTurn: string | null
  actionPending: 'NONE' | 'BUY' | 'PAY' | 'ROLL' | 'JAIL' | 'TRADE'
  dice?: [number, number]
  lastAction?: string
  logs: string[]
  gameOver: boolean
  winnerId: string | null
}

export const useGameStore = defineStore('game', () => {
  // 🔹 Состояние игры
  const status = ref<'LOBBY' | 'PLAYING' | 'ENDED'>('LOBBY')
  const players = ref<Player[]>([])
  const currentTurn = ref<string | null>(null)
  const actionPending = ref<'NONE' | 'BUY' | 'PAY' | 'ROLL' | 'JAIL' | 'TRADE'>('NONE')
  const dice = ref<[number, number] | undefined>()
  const lastAction = ref<string | undefined>()
  const logs = ref<string[]>([])
  const gameOver = ref(false)
  const winnerId = ref<string | null>(null)
  const currentRoomId = ref<string | null>(null)

  // 🔹 Список комнат в лобби (отдельно от состояния игры!)
  const availableRooms = ref<Array<{
    id: string
    status: string
    players: Array<{ id: string; name: string; isReady: boolean }>
    maxPlayers: number
    createdBy: string | null
  }>>([])

  // 🔹 Обновление состояния игры из SYNC_STATE
  const updateState = (payload: GameState) => {
    console.log('🔄 [STORE] Updating state:', payload)

    if (payload.status) status.value = payload.status
    if (payload.players) players.value = payload.players
    if (payload.currentTurn !== undefined) currentTurn.value = payload.currentTurn
    if (payload.actionPending) actionPending.value = payload.actionPending
    if (payload.dice) dice.value = payload.dice
    if (payload.lastAction) lastAction.value = payload.lastAction
    if (payload.logs) logs.value = payload.logs
    if (payload.gameOver !== undefined) gameOver.value = payload.gameOver
    if (payload.winnerId !== undefined) winnerId.value = payload.winnerId

    console.log('✅ [STORE] State updated:', {
      status: status.value,
      playerCount: players.value.length,
      turn: currentTurn.value
    })
  }

  // 🔹 Обновление списка комнат в лобби (КРИТИЧНО: создаём новый массив!)
  const updateRoomsList = (rooms: any[]) => {
    console.log('🔄 [STORE] Rooms list updated:', rooms)
    // 🔹 Создаём новый массив для реактивности Vue
    availableRooms.value = rooms.map((r: any) => ({
      id: r.id,
      status: r.status,
      players: r.players || [],
      maxPlayers: r.maxPlayers || 4,
      createdBy: r.createdBy || null
    }))
  }

  // 🔹 Применение событий от сервера (универсальный хендлер)
  const applyEvent = (data: any) => {
    if (data.type === 'SYNC_STATE' && data.payload) {
      updateState(data.payload)
    }
    if (data.type === 'ROOMS_LIST' && Array.isArray(data.rooms)) {
      updateRoomsList(data.rooms)
    }
    // Можно добавить обработку других событий здесь
  }

  // 🔹 Сброс состояния (при выходе из комнаты)
  const reset = () => {
    status.value = 'LOBBY'
    players.value = []
    currentTurn.value = null
    actionPending.value = 'NONE'
    dice.value = undefined
    lastAction.value = undefined
    logs.value = []
    gameOver.value = false
    winnerId.value = null
  }

  // 🔹 Экспортируем ВСЕ нужные поля и методы
  return {
    // Состояние
    status,
    players,
    currentTurn,
    actionPending,
    dice,
    lastAction,
    logs,
    gameOver,
    winnerId,
    availableRooms,  // 🔹 Важно!
    currentRoomId,

    // Методы
    updateState,
    updateRoomsList,  // 🔹 КРИТИЧНО: эта функция должна быть здесь!
    applyEvent,
    reset
  }
})