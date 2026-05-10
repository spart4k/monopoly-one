<!-- client/src/components/Lobby.vue -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useGameStore } from '../stores/game'
import { sendEvent } from '../lib/ws'

const store = useGameStore()

const roomName = ref('')
const playerName = ref('')

const generateId = () => `p_${Math.random().toString(36).slice(2, 8)}`

const saveSession = (id: string, name: string, roomId: string) =>
    localStorage.setItem('monopoly_session', JSON.stringify({ id, name, roomId }))

const loadSession = () => {
  try { return JSON.parse(localStorage.getItem('monopoly_session') || 'null') }
  catch { return null }
}

const joinGame = (roomId?: string, name?: string, playerId?: string) => {
  const finalRoom = roomId || roomName.value.trim() || 'default'
  const finalName = name || playerName.value.trim()
  const finalId = playerId || loadSession()?.id || generateId()

  if (!finalName) {
    store.logs.unshift('❌ Введите имя игрока')
    return
  }

  console.log(`🚀 Joining room: ${finalRoom} as ${finalName} (${finalId})`)
  saveSession(finalId, finalName, finalRoom)

  sendEvent({
    type: 'JOIN_ROOM',
    roomId: finalRoom,
    playerId: finalId,
    name: finalName
  })
}

// 🔄 Авто-подключение при загрузке (если есть сессия)
onMounted(() => {
  const session = loadSession()
  if (session?.id && session?.roomId) {
    roomName.value = session.roomId
    playerName.value = session.name
    // Небольшая задержка, чтобы WS успел подключиться
    setTimeout(() => joinGame(session.roomId, session.name, session.id), 300)
  }
})

const players = computed(() => store.players)
const myId = computed(() => loadSession()?.id)
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
    <div class="bg-gray-800/90 backdrop-blur p-8 rounded-2xl shadow-2xl max-w-md w-full space-y-6 border border-gray-700">

      <!-- Заголовок -->
      <div class="text-center space-y-2">
        <h1 class="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">🎲 Monopoly</h1>
        <p class="text-gray-400 text-sm">Онлайн-версия для друзей</p>
      </div>

      <!-- Форма подключения -->
      <div class="space-y-4">
        <div>
          <label class="block text-gray-300 text-sm font-medium mb-2">🏠 Комната</label>
          <input
              v-model="roomName"
              placeholder="Например: office-friday"
              class="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 outline-none transition"
          />
        </div>
        <div>
          <label class="block text-gray-300 text-sm font-medium mb-2">👤 Твоё имя</label>
          <input
              v-model="playerName"
              placeholder="Как тебя называть?"
              class="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 outline-none transition"
          />
        </div>
        <button
            @click="joinGame()"
            class="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-lg transition active:scale-95 shadow-lg"
        >
          🚀 Подключиться
        </button>
      </div>

      <!-- Список игроков -->
      <div v-if="players.length" class="space-y-3 pt-4 border-t border-gray-700">
        <h3 class="text-white font-semibold flex items-center gap-2">
          👥 Игроки <span class="text-gray-400 text-sm font-normal">({{ players.length }})</span>
        </h3>
        <div class="space-y-2">
          <div
              v-for="p in players"
              :key="p.id"
              class="flex items-center gap-3 p-3 rounded-lg bg-gray-700/30 border border-gray-600/30 transition hover:bg-gray-700/50"
          >
            <span class="w-4 h-4 rounded-full shadow-md border-2 border-white/40" :class="p.color"></span>
            <span class="text-gray-200 flex-1 font-medium">{{ p.name }}</span>
            <span v-if="p.id === myId" class="text-xs bg-blue-600/30 text-blue-300 px-2 py-0.5 rounded-full">ты</span>
            <span v-if="store.currentTurn === p.id" class="text-xs bg-green-600/30 text-green-300 px-2 py-0.5 rounded-full animate-pulse">🎲 ход</span>
          </div>
        </div>
      </div>

      <!-- Лог событий -->
      <div class="pt-4 border-t border-gray-700">
        <div class="h-32 overflow-y-auto bg-gray-900/50 rounded-lg p-3 text-xs font-mono space-y-1.5 border border-gray-700 scrollbar-thin">
          <div v-for="(log, i) in store.logs" :key="i" class="text-gray-300 border-b border-gray-800/50 pb-1 last:border-0">
            {{ log }}
          </div>
        </div>
      </div>

      <!-- Быстрый вход как гость -->
      <p class="text-center text-gray-500 text-xs pt-2">
        <button
            @click="roomName='demo'; playerName='Guest-'+Math.random().toString(36).slice(2,5); joinGame()"
            class="text-blue-400 hover:text-blue-300 hover:underline transition"
        >
          → Войти как гость
        </button>
      </p>
    </div>
  </div>
</template>

<style scoped>
.scrollbar-thin::-webkit-scrollbar { width: 4px; }
.scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
.scrollbar-thin::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 2px; }
.scrollbar-thin::-webkit-scrollbar-thumb:hover { background: #6b7280; }
</style>