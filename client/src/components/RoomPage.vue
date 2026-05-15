<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from '../stores/game'
import { useSession } from '../composables/useSession'
import { useAuth } from '../composables/useAuth'
import { sendEvent } from '../lib/ws'
import MonopolyBoard from './MonopolyBoard.vue'

const route = useRoute()
const router = useRouter()
const store = useGameStore()
const session = useSession()
const auth = useAuth()

const roomId = route.params.roomId as string
const isConnecting = ref(true)
const error = ref('')

onMounted(() => {
  session.ensureSession()
  const name = auth.user.value?.nickname || session.playerName.value || 'Player'
  sendEvent({ type: 'JOIN_ROOM', roomId, playerId: session.myId.value, name })

  const timeout = setTimeout(() => {
    if (!session.roomId.value || store.status === 'LOBBY') {
      error.value = 'Не удалось подключиться к комнате. Попробуйте через лобби.'
      isConnecting.value = false
    } else {
      isConnecting.value = false
    }
  }, 6000)
  onUnmounted(() => clearTimeout(timeout))
})

const leaveRoom = () => {
  session.clearSession()
  sendEvent({ type: 'GET_LOBBY' })
  router.push('/')
}
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white flex flex-col">
    <header class="bg-gray-800 border-b border-gray-700 px-6 py-3 flex items-center justify-between">
      <h1 class="text-lg font-bold flex items-center gap-2">🚪 Комната: <span class="text-blue-400">{{ roomId }}</span></h1>
      <button @click="leaveRoom" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg text-sm transition">🔙 В лобби</button>
    </header>

    <div v-if="isConnecting" class="flex-1 flex items-center justify-center">
      <div class="text-center space-y-4">
        <div class="text-5xl animate-spin">🎲</div>
        <h2 class="text-xl font-bold">Подключение...</h2>
        <p class="text-gray-400 text-sm">Синхронизация состояния</p>
      </div>
    </div>

    <div v-else-if="error" class="flex-1 flex items-center justify-center">
      <div class="bg-red-900/30 p-8 rounded-xl border border-red-800 text-center space-y-4 max-w-md">
        <span class="text-4xl">❌</span>
        <h2 class="text-lg font-bold text-red-300">{{ error }}</h2>
        <button @click="leaveRoom" class="px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition">Вернуться в лобби</button>
      </div>
    </div>

    <template v-else>
      <MonopolyBoard />
    </template>
  </div>
</template>