// client/src/stores/game.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useGameStore = defineStore('game', () => {
  const status = ref<'LOBBY' | 'PLAYING' | 'ENDED'>('LOBBY')
  const currentTurn = ref<string>('')
  const lastDice = ref<[number, number]>([1, 1])
  const players = ref<any[]>([])
  const logs = ref<string[]>([])
  const availableRooms = ref<any[]>([])

  const pendingAction = ref<'BUY' | 'CARD' | 'INFO' | 'DOUBLE_TURN' | null>(null)
  const selectedSpaceId = ref<number | null>(null)
  const pendingInfo = ref<any>(null)
  // 🔑 Новый объект для карт
  const pendingCard = ref<{ text: string; action: string; amount?: number } | null>(null)

  const activeTrade = ref<any>(null)

  function applyEvent(event: any) {
    if (!event?.type) return
    try {
      switch (event.type) {
        case 'ROOMS_LIST': availableRooms.value = event.rooms || []; break
        case 'SYNC_STATE':
          if (!event.payload) return
          activeTrade.value = event.payload.activeTrade || null
          status.value = event.payload.status || 'LOBBY'
          currentTurn.value = event.payload.currentTurn || ''
          players.value = event.payload.players || []
          if (event.payload.lastDice) lastDice.value = event.payload.lastDice
          if (Array.isArray(event.payload.logs)) logs.value.splice(0, logs.value.length, ...event.payload.logs.slice(-50))
          break
        case 'PLAYER_MOVED':
          lastDice.value = event.dice || [0, 0]
          const p = players.value.find((pl: any) => pl.id === event.playerId)
          if (p) p.pos = event.to
          break
        case 'CARD_DRAWN':
          pendingCard.value = event.card || { text: 'Карта вытянута', action: 'move' }
          pendingAction.value = 'CARD'
          break
        case 'MY_ID':
          // 🔑 Сервер явно сказал нам наш ID → сохраняем
          if (event.playerId && event.roomId) {
            console.log('✅ [STORE] Received MY_ID:', event.playerId)
            // Используем useSession напрямую, если он импортирован
            // Или просто обновляем локальный стейт, если сессия управляется отдельно
            if (typeof window !== 'undefined') {
              sessionStorage.setItem('monopoly_playerId', event.playerId)
              sessionStorage.setItem('monopoly_roomId', event.roomId)
            }
          }
          break
        case 'OFFER_BUY':
          pendingAction.value = 'BUY'
          selectedSpaceId.value = event.spaceId
          break
        case 'ACTION_REQUIRED':
          pendingAction.value = 'INFO'
          pendingInfo.value = event
          selectedSpaceId.value = event.spaceId ?? null // 🔑 Запоминаем ID ячейки действия
          break
        case 'DOUBLE_ROLLED': pendingAction.value = 'DOUBLE_TURN'; break
        case 'ERROR': console.warn('⚠️ STORE ERROR:', event.message); logs.value.unshift(`❌ ${event.message}`); break
      }
    } catch (err) { console.error('💥 STORE applyEvent crash:', err) }
  }

  function clearPendingAction() {
    pendingAction.value = null
    selectedSpaceId.value = null
    pendingInfo.value = null
    pendingCard.value = null
  }

  return {
    status, currentTurn, players, logs, availableRooms, lastDice,
    pendingAction, selectedSpaceId, pendingInfo, pendingCard,
    applyEvent, clearPendingAction, activeTrade
  }
})