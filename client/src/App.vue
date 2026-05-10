<!-- client/src/App.vue -->
<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { useGameStore } from './stores/game'
import { initWs, sendEvent } from './lib/ws'
import Lobby from './components/Lobby.vue'
import MonopolyBoard from './components/MonopolyBoard.vue'

const store = useGameStore()
let wsInstance: any = null

onMounted(() => {
  const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3000/ws'
  console.log('🔌 [APP] Connecting to', wsUrl)

  wsInstance = initWs(wsUrl, (data) => {
    console.log('📥 [APP] Received:', data.type, data)
    store.applyEvent(data)
  }, () => console.log('🔌 [APP] WS closed'))
})

onUnmounted(() => wsInstance?.close())

// 🐛 Отслеживаем изменение статуса для отладки
watch(() => store.status, (newVal, oldVal) => {
  console.log(`🔄 [APP] Status changed: ${oldVal} -> ${newVal}`)
}, { immediate: true })
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white relative">
    <!-- 🐛 Отладочная панель (всегда поверх всего) -->
    <div class="fixed top-4 left-4 bg-gray-800/90 backdrop-blur text-white px-3 py-2 rounded-lg text-xs z-50 border border-gray-600 shadow-xl font-mono">
      🟢 WS: {{ wsInstance?.getReadyState?.() === 1 ? 'connected' : 'disconnected' }}<br>
      🎮 Status: <span class="font-bold text-yellow-300">{{ store.status || 'undefined' }}</span><br>
      👥 Players: {{ store.players.length }}
    </div>

    <!-- Рендер -->
    <template v-if="store.status === 'LOBBY'">
      <Lobby />
    </template>
    <template v-else-if="store.status === 'PLAYING'">
      <MonopolyBoard />
    </template>
    <template v-else>
      <div class="flex flex-col items-center justify-center h-screen gap-6 p-6">
        <h1 class="text-4xl font-bold text-gray-300">⏳ Ожидание данных...</h1>
        <p class="text-gray-500">Текущий статус: <code class="bg-gray-800 px-2 py-1 rounded">{{ store.status }}</code></p>
        <button @click="store.status = 'LOBBY'" class="px-5 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition">🔄 В лобби</button>
      </div>
    </template>
  </div>
</template>

<style>
#app {
  width: 100%;
}
</style>