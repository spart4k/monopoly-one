<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useGameStore } from '../stores/game'
import { useAuth } from '../composables/useAuth'
import { useSession } from '../composables/useSession'
import { sendEvent } from '../lib/ws'
import AuthModal from './AuthModal.vue'

const store = useGameStore()
const auth = useAuth()
const session = useSession()

const roomName = ref('')
const showAuthModal = ref(false)

const isInRoom = computed(() => !!session.roomId.value && store.status === 'LOBBY')
const me = computed(() => store.players.find(p => p.id === session.myId.value))
const isMyReady = computed(() => me.value?.isReady ?? false)
const isHost = computed(() => store.players.length > 0 && store.players[0].id === session.myId.value)
const canStart = computed(() => isHost.value && store.players.length >= 2 && store.players.every(p => p.isReady || p.id === session.myId.value))

onMounted(() => {
  session.ensureSession()
  if (auth.user.value?.nickname) roomName.value = `Room_${Math.floor(Math.random()*9000)+1000}`
  sendEvent({ type: 'GET_LOBBY' })
})

const handleCreate = () => { if (!roomName.value.trim() || isInRoom.value) return; sendEvent({ type: 'JOIN_ROOM', roomId: roomName.value.trim(), playerId: session.myId.value, name: auth.user.value?.nickname || session.playerName.value || 'Player' }) }
const handleJoin = (id: string) => { if (isInRoom.value) return; sendEvent({ type: 'JOIN_ROOM', roomId: id, playerId: session.myId.value, name: auth.user.value?.nickname || session.playerName.value || 'Player' }) }
const toggleReady = () => { if (isInRoom.value) sendEvent({ type: 'SET_READY', playerId: session.myId.value, roomId: session.roomId.value, isReady: !isMyReady.value }) }
const startGame = () => { if (canStart.value) sendEvent({ type: 'START_GAME', playerId: session.myId.value, roomId: session.roomId.value }) }
const leaveRoom = () => { session.clearSession(); sendEvent({ type: 'GET_LOBBY' }) }
const handleAuthSuccess = () => { showAuthModal.value = false }
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white flex flex-col">
    <header class="bg-gray-800 border-b border-gray-700 px-6 py-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <span class="text-2xl">🎲</span>
        <h1 class="text-xl font-bold">Монополия Онлайн</h1>
      </div>
      <div v-if="auth.isAuthenticated.value" class="flex items-center gap-3 bg-gray-700/60 px-3 py-1.5 rounded-full border border-gray-600">
        <div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-sm">{{ auth.user.value?.nickname?.charAt(0).toUpperCase() }}</div>
        <span class="text-sm font-medium">{{ auth.user.value?.nickname }}</span>
        <button @click="auth.logout" class="text-xs text-red-400 hover:text-red-300 ml-1">Выйти</button>
      </div>
      <button v-else @click="showAuthModal = true" class="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition">🔐 Войти</button>
    </header>

    <main class="flex-1 flex overflow-hidden">
      <div class="flex-1 p-6 overflow-y-auto">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold">Доступные комнаты</h2>
          <div class="flex gap-2">
            <input v-model="roomName" placeholder="Название комнаты..." class="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500" @keyup.enter="handleCreate" />
            <button @click="handleCreate" class="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition">Создать</button>
          </div>
        </div>

        <div v-if="!store.availableRooms?.length" class="text-center py-12 text-gray-500">Нет активных комнат</div>
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div v-for="room in store.availableRooms" :key="room.id" class="bg-gray-800 border border-gray-700 rounded-xl p-4 hover:border-blue-500 transition cursor-pointer" @click="handleJoin(room.id)">
            <div class="flex items-center justify-between mb-2">
              <span class="font-bold text-lg">{{ room.id }}</span>
              <span class="text-xs px-2 py-0.5 rounded-full" :class="room.status === 'LOBBY' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'">
                {{ room.status === 'LOBBY' ? '🟢 Ожидание' : '🟡 Игра' }}
              </span>
            </div>
            <div class="flex items-center gap-2 text-sm text-gray-400">
              <span>👤 {{ room.players?.length || 0 }}/4</span>
            </div>
            <button class="w-full mt-3 py-1.5 bg-gray-700 hover:bg-blue-600 rounded text-sm transition">Войти</button>
          </div>
        </div>
      </div>

      <aside v-if="isInRoom" class="w-80 bg-gray-800 border-l border-gray-700 p-5 flex flex-col">
        <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">🚪 Комната <span class="text-blue-400">{{ session.roomId }}</span></h2>
        <div class="bg-gray-700/40 rounded-lg p-3 mb-4 space-y-2">
          <div v-for="p in store.players" :key="p.id" class="flex items-center justify-between text-sm">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full" :class="p.id === session.myId.value ? 'bg-blue-500' : 'bg-gray-500'"></span>
              <span>{{ p.name }} <span v-if="p.id === session.myId.value" class="text-xs text-blue-300">(Вы)</span></span>
            </div>
            <span class="text-xs" :class="p.isReady ? 'text-green-400' : 'text-gray-400'">{{ p.isReady ? '✅' : '⏳' }}</span>
          </div>
        </div>
        <div class="space-y-2 mt-auto">
          <button @click="toggleReady" class="w-full py-2.5 rounded-lg font-medium transition" :class="isMyReady ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'">
            {{ isMyReady ? '❌ Отменить готовность' : '✅ Я готов' }}
          </button>
          <button v-if="isHost" @click="startGame" :disabled="!canStart" class="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition">
            🚀 Начать игру
          </button>
          <button @click="leaveRoom" class="w-full py-2 bg-red-900/40 hover:bg-red-900/70 text-red-300 rounded-lg text-sm transition">🚪 Покинуть комнату</button>
        </div>
      </aside>
    </main>

    <Teleport to="body">
      <AuthModal v-if="showAuthModal" @close="handleAuthSuccess" />
    </Teleport>
  </div>
</template>