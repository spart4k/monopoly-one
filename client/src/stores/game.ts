// client/src/stores/game.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

// 🔹 Типы для состояния
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
  isReady?: boolean
}

export type PendingCard = {
  text: string
  action: string
  amount?: number
  targetSpaceId?: number
}

export type PendingPayment = {
  amount: number
  creditorId: string | null
  type: 'rent' | 'tax' | 'bonus'
}

export type PendingInfo = {
  title: string
  message: string
  icon: string
  amount?: number
  spaceId?: number
  isMandatory?: boolean
}

export const useGameStore = defineStore('game', () => {
  // 🔹 Основное состояние игры
  const status = ref<'LOBBY' | 'PLAYING' | 'ENDED'>('LOBBY')
  const currentTurn = ref<string>('')
  const lastDice = ref<[number, number]>([1, 1])
  const players = ref<Player[]>([])
  const logs = ref<string[]>([])
  const availableRooms = ref<any[]>([])

  // 🔹 Состояние действий (управляет модалками и панелями)
  // 🔑 КРИТИЧНО: имя переменной — pendingAction, сервер шлёт actionPending → маппим в applyEvent
  const pendingAction = ref<'BUY' | 'CARD' | 'INFO' | 'DOUBLE_TURN' | null>(null)
  const selectedSpaceId = ref<number | null>(null)

  // 🔹 Детали действий
  const pendingInfo = ref<PendingInfo | null>(null)
  const pendingCard = ref<PendingCard | null>(null)
  const pendingPayment = ref<PendingPayment | null>(null)

  const activeTrade = ref<any>(null)

  // 🔹 Применение событий от сервера
  function applyEvent(event: any) {
    if (!event?.type) return

    try {
      switch (event.type) {
        // 📡 Список комнат (лобби)
        case 'ROOMS_LIST':
          console.log(`📥 [STORE] ROOMS_LIST: ${event.rooms?.length || 0} rooms`)
          availableRooms.value = event.rooms || []
          break

        // 🔄 Полная синхронизация состояния
        case 'SYNC_STATE':
          if (!event.payload) return

          status.value = event.payload.status || 'LOBBY'
          currentTurn.value = event.payload.currentTurn || ''
          players.value = event.payload.players || []

          if (event.payload.lastDice) lastDice.value = event.payload.lastDice

          // 🔑 КРИТИЧНО: сервер шлёт actionPending → маппим в pendingAction.value
          pendingAction.value = event.payload.actionPending || null
          pendingCard.value = event.payload.pendingCard || null
          pendingPayment.value = event.payload.pendingPayment || null
          selectedSpaceId.value = event.payload.selectedSpaceId ?? null
          activeTrade.value = event.payload.activeTrade || null

          // 🔹 Логи: безопасное обновление массива
          if (Array.isArray(event.payload.logs)) {
            logs.value = [...event.payload.logs.slice(-50)]
          }
          break

        // 🚶 Перемещение фишки
        case 'PLAYER_MOVED':
          lastDice.value = event.dice || [0, 0]
          const pMove = players.value.find((pl: Player) => pl.id === event.playerId)
          if (pMove) pMove.pos = event.to
          break

        // 🃏 Вытянута карта
        case 'CARD_DRAWN':
          pendingCard.value = event.card || { text: 'Карта вытянута', action: 'move' }
          pendingAction.value = 'CARD' // 🔑 Устанавливаем локально
          break

        // 🆔 Сервер присвоил нам ID
        case 'MY_ID':
          if (event.playerId && event.roomId) {
            console.log('✅ [STORE] Received MY_ID:', event.playerId)
            if (typeof window !== 'undefined') {
              sessionStorage.setItem('monopoly_playerId', event.playerId)
              sessionStorage.setItem('monopoly_roomId', event.roomId)
            }
          }
          break

        // 🏠 Предложение купить улицу
        case 'OFFER_BUY':
          pendingAction.value = 'BUY' // 🔑 Устанавливаем локально
          selectedSpaceId.value = event.spaceId
          break

        // 🚔 Игрок отправлен в тюрьму
        case 'GO_TO_JAIL':
          const pJail = players.value.find((p: Player) => p.id === event.playerId)
          if (pJail) {
            pJail.pos = 10
            pJail.isInJail = true
            pJail.jailTurns = 0
            pJail.consecutiveDoubles = 0
          }
          break

        // 💸 Требуется действие (аренда/налог/бонус)
        case 'ACTION_REQUIRED':
          pendingAction.value = 'INFO' // 🔑 Устанавливаем локально
          pendingInfo.value = event
          selectedSpaceId.value = event.spaceId ?? null
          break

        // 🎲 Выпал дубль
        case 'DOUBLE_ROLLED':
          pendingAction.value = 'DOUBLE_TURN' // 🔑 Устанавливаем локально
          break

        // ❌ Ошибка
        case 'ERROR':
          console.warn('⚠️ STORE ERROR:', event.message)
          logs.value = [`❌ ${event.message}`, ...logs.value].slice(0, 50)
          break
      }
    } catch (err) {
      console.error('💥 STORE applyEvent crash:', err)
    }
  }

  // 🔹 Очистка состояния действий
  // ⚠️ Использовать ТОЛЬКО при смене хода или явном закрытии модалки
  // НЕ использовать для подтверждения действий (это делает сервер через SYNC_STATE)
  function clearPendingAction() {
    pendingAction.value = null
    selectedSpaceId.value = null
    pendingInfo.value = null
    pendingCard.value = null
  }

  // 🔹 Хелперы
  const getPlayer = (id: string) => players.value.find(p => p.id === id)
  const getMe = () => players.value.find(p => p.id === sessionStorage.getItem('monopoly_playerId'))

  return {
    // State
    status,
    currentTurn,
    players,
    logs,
    availableRooms,
    lastDice,
    pendingAction,        // 🔑 Это поле используется в компонентах
    selectedSpaceId,
    pendingInfo,
    pendingCard,
    pendingPayment,
    activeTrade,

    // Actions
    applyEvent,
    clearPendingAction,

    // Getters
    getPlayer,
    getMe
  }
})