<script setup lang="ts">
import { onMounted, onUnmounted, watch, ref } from 'vue'
import { useGameStore } from './stores/game'
import { initWs, sendEvent, isConnected } from './lib/ws'
import { useSession } from './composables/useSession'
import Lobby from './components/Lobby.vue'
import MonopolyBoard from './components/MonopolyBoard.vue'
import GameOverModal from './components/GameOverModal.vue'

const store = useGameStore()
const { myId, roomId, playerName, setSession, clearSession, ensureSession } = useSession()
let wsInstance: any = null
const isReconnecting = ref(false)

onMounted(() => {
  ensureSession()
  const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3000/ws'
  console.log('🔌 [APP] Connecting to', wsUrl, 'myId:', myId.value, 'name:', playerName.value)

  wsInstance = initWs(
      wsUrl,
      (data) => {
        console.log('📥 [APP] Received:', data.type, data)
        store.applyEvent(data)
        if (data.type === 'MY_ID' && data.playerId && data.roomId) {
          setSession(data.playerId, data.roomId, data.name || playerName.value || undefined)
        }
        if (data.type === 'ERROR' && (data.message?.includes('not found') || data.message?.includes('Player not found'))) {
          clearSession()
          if (store.status === 'PLAYING') store.status = 'LOBBY'
        }
      },
      () => console.log('🔌 [APP] WS closed')
  )
})

onUnmounted(() => { wsInstance?.close() })

watch(isConnected, (connected) => {
  if (!connected && store.status === 'PLAYING') { isReconnecting.value = true }
  else if (connected && isReconnecting.value && store.status !== 'PLAYING') { sendEvent({ type: 'GET_LOBBY' }) }
})

watch(() => store.status, (newVal, oldVal) => {
  if (newVal === 'LOBBY' && oldVal === 'PLAYING') { clearSession(); isReconnecting.value = false }
}, { immediate: true })

const leaveGame = () => {
  clearSession(); isReconnecting.value = false; store.status = 'LOBBY'; sendEvent({ type: 'GET_LOBBY' })
}
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white relative">
    <div v-if="isReconnecting && store.status === 'PLAYING'" class="fixed inset-0 z-[100] bg-gray-900/95 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
      <div class="text-2xl font-bold animate-pulse">🔄 Переподключение...</div>
      <p class="text-gray-400 text-sm">Не закрывайте вкладку</p>
      <button @click="leaveGame" class="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition text-sm">Вернуться в лобби</button>
    </div>

    <div class="fixed top-4 left-4 bg-gray-800/90 backdrop-blur text-white px-3 py-2 rounded-lg text-xs z-50 border border-gray-600 shadow-xl font-mono">
      🟢 WS: {{ isConnected ? 'connected' : 'disconnected' }}<br>
      🎮 Status: <span class="font-bold text-yellow-300">{{ store.status || 'undefined' }}</span><br>
      👥 Players: {{ store.players.length }}<br>
      🔑 Session: {{ myId ? '✅' : '❌' }}
    </div>

    <GameOverModal v-if="store.gameOver" @close="store.gameOver = false" />

    <template v-if="store.status === 'LOBBY'">
      <Lobby />
    </template>
    <template v-else-if="store.status === 'PLAYING'">
      <MonopolyBoard />
    </template>
    <template v-else>
      <div class="flex flex-col items-center justify-center h-screen gap-6 p-6">
        <h1 class="text-4xl font-bold text-gray-300">{{ isReconnecting ? '⏳ Восстановление...' : '⏳ Ожидание данных...' }}</h1>
        <p class="text-gray-500">Текущий статус: <code class="bg-gray-800 px-2 py-1 rounded">{{ store.status }}</code></p>
        <div class="flex gap-3">
          <button @click="leaveGame" class="px-5 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition">🔄 В лобби</button>
          <button v-if="isReconnecting" @click="isReconnecting = false" class="px-5 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition">Пропустить</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style>#app { width: 100%; }</style>