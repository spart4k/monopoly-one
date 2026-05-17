import { defineStore } from 'pinia'
import { ref } from 'vue'

export type Player = {
  id: string; name: string; color: string; pos: number; money: number
  properties: number[]; houses: Record<number, number>; mortgaged: number[]
  isInJail: boolean; jailTurns: number; jailCards: number
  consecutiveDoubles: number; housesBoughtThisTurn: boolean; isReady?: boolean; isBankrupt?: boolean
}

export type PendingCard = { text: string; action: string; amount?: number; targetSpaceId?: number }
export type PendingPayment = { amount: number; creditorId: string | null; type: 'rent' | 'tax' | 'bonus' }
export type PendingInfo = { title: string; message: string; icon: string; amount?: number; spaceId?: number; isMandatory?: boolean }

export const useGameStore = defineStore('game', () => {
  const status = ref<'LOBBY' | 'PLAYING' | 'ENDED'>('LOBBY')
  const currentTurn = ref<string>('')
  const lastDice = ref<[number, number]>([1, 1])
  const players = ref<Player[]>([])
  const logs = ref<string[]>([])
  const availableRooms = ref<any[]>([])

  const pendingAction = ref<'BUY' | 'CARD' | 'INFO' | 'DOUBLE_TURN' | null>(null)
  const selectedSpaceId = ref<number | null>(null)
  const pendingInfo = ref<PendingInfo | null>(null)
  const pendingCard = ref<PendingCard | null>(null)
  const pendingPayment = ref<PendingPayment | null>(null)
  const activeTrade = ref<any>(null)

  const gameOver = ref(false)
  const winnerId = ref<string | null>(null)
  const winnerName = ref<string | null>(null)

  function applyEvent(event: any) {
    if (!event?.type) return
    try {
      switch (event.type) {
        case 'ROOMS_LIST': availableRooms.value = event.rooms || []; break
        case 'SYNC_STATE':
          if (!event.payload) return
          status.value = event.payload.status || 'LOBBY'
          currentTurn.value = event.payload.currentTurn || ''
          players.value = event.payload.players || []
          if (event.payload.lastDice) lastDice.value = event.payload.lastDice
          pendingAction.value = event.payload.actionPending || null
          pendingCard.value = event.payload.pendingCard || null
          pendingPayment.value = event.payload.pendingPayment || null
          selectedSpaceId.value = event.payload.selectedSpaceId ?? null
          activeTrade.value = event.payload.activeTrade || null
          if (Array.isArray(event.payload.logs)) logs.value = [...event.payload.logs.slice(-50)]
          break
        case 'PLAYER_MOVED':
          lastDice.value = event.dice || [0, 0]
          const p = players.value.find((pl: Player) => pl.id === event.playerId)
          if (p) p.pos = event.to
          break
        case 'MY_ID':
          if (event.playerId && event.roomId) {
            if (typeof window !== 'undefined') {
              sessionStorage.setItem('monopoly_playerId', event.playerId)
              sessionStorage.setItem('monopoly_roomId', event.roomId)
            }
          }
          break
        case 'OFFER_BUY': pendingAction.value = 'BUY'; selectedSpaceId.value = event.spaceId; break
        case 'GO_TO_JAIL':
          const pJail = players.value.find((p: Player) => p.id === event.playerId)
          if (pJail) {
            // 🔹 Реальное перемещение (после отложенного приговора)
            pJail.pos = 10
            pJail.isInJail = true
            pJail.jailTurns = 0
            pJail.consecutiveDoubles = 0
            logs.value.unshift(`🚔 ${pJail.name} перемещён в тюрьму`)
          }
          break
        case 'ACTION_REQUIRED':
          pendingAction.value = 'INFO'; pendingInfo.value = event; selectedSpaceId.value = event.spaceId ?? null; break
        case 'DOUBLE_ROLLED': pendingAction.value = 'DOUBLE_TURN'; break
        case 'GAME_OVER':
          gameOver.value = true
          winnerId.value = event.winnerId || null
          winnerName.value = event.winnerName || null
          console.log(`🏁 [STORE] Game over! Winner: ${winnerName.value || 'Никто'}`)
          break
        case 'ERROR': console.warn('⚠️ STORE ERROR:', event.message); logs.value.unshift(`❌ ${event.message}`); break
      }
    } catch (err) { console.error('💥 STORE applyEvent crash:', err) }
  }

  function clearPendingAction() {
    pendingAction.value = null; selectedSpaceId.value = null; pendingInfo.value = null; pendingCard.value = null
  }

  return {
    status, currentTurn, players, logs, availableRooms, lastDice,
    pendingAction, selectedSpaceId, pendingInfo, pendingCard, pendingPayment, activeTrade,
    gameOver, winnerId, winnerName,
    applyEvent, clearPendingAction
  }
})