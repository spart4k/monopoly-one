<!-- client/src/App.vue -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useGameStore } from './stores/game'
import { initWs, sendEvent } from './lib/ws'
import Lobby from './components/Lobby.vue'
import MonopolyBoard from './components/MonopolyBoard.vue'

console.log('🚀 [APP] Script starting')

const store = useGameStore()
const wsStatus = ref('disconnected')
let ws: any = null

onMounted(() => {
  console.log('✅ [APP] onMounted')

  const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3000/ws'
  console.log(`🔌 [APP] Connecting to ${wsUrl}`)

  ws = initWs(
      wsUrl,
      // 🔥 Ключевой коллбэк: ловим ВСЕ сообщения
      (data) => {
        console.log('📥 [APP] Received from WS:', data.type, data)
        try {
          console.log('🧩 [APP] Calling store.applyEvent...')
          store.applyEvent(data)
          console.log('✅ [APP] applyEvent completed, status:', store.status, 'players:', store.players.length)
        } catch (err) {
          console.error('💥 [APP] applyEvent CRASHED:', err)
        }
      },
      () => {
        console.log('🔌 [APP] WS closed callback')
        wsStatus.value = 'disconnected'
      }
  )

  // Обновляем статус для отладки
  setInterval(() => {
    wsStatus.value = ws?.getReadyState?.() === 1 ? 'connected' : 'disconnected'
  }, 1000)
})

onUnmounted(() => {
  console.log('👋 [APP] Unmounting')
  ws?.close()
})

// Экспортируем для дочерних компонентов
defineExpose({ sendEvent })
</script>

<template>
  <!-- Индикатор статуса для отладки -->
  <div v-if="wsStatus === 'disconnected'" class="fixed top-2 right-2 bg-red-600 text-white px-3 py-1 rounded text-xs z-50">
    🔴 WS: disconnected
  </div>

  <div class="min-h-screen bg-gray-900 text-white">
    <Lobby v-if="store.status === 'LOBBY'" />
    <MonopolyBoard v-else-if="store.status === 'PLAYING'" />
    <div v-else class="flex items-center justify-center h-screen">
      <h1 class="text-3xl font-bold">🎮 {{ store.status }}</h1>
    </div>
  </div>
</template>