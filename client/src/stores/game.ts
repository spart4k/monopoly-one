// client/src/stores/game.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useGameStore = defineStore('game', () => {
  const status = ref<'LOBBY' | 'PLAYING' | 'ENDED'>('LOBBY')
  const currentTurn = ref<string>('')
  const lastDice = ref<[number, number]>([1, 1])

  const players = ref<Array<any>>([]) // any временно для стабильности
  const logs = ref<string[]>([])

  const pendingAction = ref<'BUY' | 'CARD' | 'INFO' | 'DOUBLE_TURN' | null>(null)
  const selectedSpaceId = ref<number | null>(null)
  const pendingCardText = ref<string | null>(null)
  const pendingInfo = ref<any>(null)

  function applyEvent(event: any) {
    console.log('🧩 STORE: applyEvent вызван для', event?.type, event)
    if (!event?.type) return

    try {
      switch (event.type) {
        case 'SYNC_STATE': {
          console.log('🔄 STORE: Обновляю SYNC_STATE')
          if (event.payload) {
            status.value = event.payload.status || status.value
            currentTurn.value = event.payload.currentTurn || ''
            players.value = event.payload.players || players.value
            if (event.payload.lastDice) lastDice.value = event.payload.lastDice
            if (event.payload.logs && Array.isArray(event.payload.logs)) {
              logs.value.splice(0, logs.value.length, ...event.payload.logs.slice(-50))
            }
          }
          pendingAction.value = null
          pendingCardText.value = null
          pendingInfo.value = null
          break
        }

        case 'PLAYER_MOVED': {
          lastDice.value = event.dice || [0, 0]
          const p = players.value.find((pl: any) => pl.id === event.playerId)
          if (p) p.pos = event.to
          break
        }

        case 'CARD_DRAWN': {
          pendingCardText.value = event.text || 'Карта вытянута'
          pendingAction.value = 'CARD'
          selectedSpaceId.value = -1
          console.log('🃏 STORE: Карта вытянута:', pendingCardText.value)
          break
        }

        case 'OFFER_BUY': {
          pendingAction.value = 'BUY'
          selectedSpaceId.value = event.spaceId
          console.log('🏠 STORE: Предложение купить:', event.spaceId)
          break
        }

        case 'ACTION_REQUIRED': {
          pendingAction.value = 'INFO'
          pendingInfo.value = event
          break
        }

        case 'DOUBLE_ROLLED': {
          pendingAction.value = 'DOUBLE_TURN'
          console.log('🎲 STORE: Дубль! Повторный бросок разрешён')
          break
        }

        case 'ERROR': {
          console.warn('⚠️ STORE ERROR:', event.message)
          logs.value.unshift(`❌ ${event.message}`)
          break
        }
      }
    } catch (err) {
      console.error('💥 STORE: applyEvent internal crash:', err, 'event:', event)
    }
  }

  function clearPendingAction() {
    pendingAction.value = null
    selectedSpaceId.value = null
    pendingCardText.value = null
    pendingInfo.value = null
  }

  return {
    status, currentTurn, players, logs, lastDice,
    pendingAction, selectedSpaceId, pendingCardText, pendingInfo,
    applyEvent, clearPendingAction
  }
})