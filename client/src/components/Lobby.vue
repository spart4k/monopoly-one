<!-- client/src/components/Lobby.vue -->
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

const username = ref('')
const roomName = ref('')
const showAuthModal = ref(false)

// 🔑 Состояния комнаты
const isInRoom = computed(() => !!session.roomId.value && store.status === 'LOBBY')
const me = computed(() => store.players.find(p => p.id === session.myId.value))
const isMyReady = computed(() => me.value?.isReady ?? false)
const isHost = computed(() => store.players.length > 0 && store.players[0].id === session.myId.value)
const canStart = computed(() =>
    isHost.value &&
    store.players.length >= 2 &&
    store.players.every(p => p.isReady || p.id === session.myId.value)
)

// 🔑 Авто-подстановка имени
onMounted(() => {
  session.ensureSession()
  if (auth.user.value?.nickname) username.value = auth.user.value.nickname
  else if (session.playerName.value && !username.value) username.value = session.playerName.value
  sendEvent({ type: 'GET_LOBBY' })
})

// 🔑 Действия с защитой от дублей
const handleCreate = () => {
  if (isInRoom.value || !roomName.value.trim()) return
  const name = username.value.trim() || auth.user.value?.nickname || 'Player'
  sendEvent({ type: 'JOIN_ROOM', roomId: roomName.value, playerId: session.myId.value, name })
}

const handleJoin = (id: string) => {
  if (isInRoom.value) return
  const name = username.value.trim() || auth.user.value?.nickname || 'Player'
  sendEvent({ type: 'JOIN_ROOM', roomId: id, playerId: session.myId.value, name })
}

const toggleReady = () => {
  if (!isInRoom.value || !session.roomId.value) return
  sendEvent({
    type: 'SET_READY',
    playerId: session.myId.value,
    roomId: session.roomId.value,
    isReady: !isMyReady.value
  })
}

const startGame = () => {
  if (!canStart.value) return
  sendEvent({ type: 'START_GAME', playerId: session.myId.value, roomId: session.roomId.value })
}

const leaveRoom = () => {
  session.clearSession()
  sendEvent({ type: 'GET_LOBBY' })
}

const handleAuthSuccess = () => {
  showAuthModal.value = false
  if (auth.user.value?.nickname) username.value = auth.user.value.nickname
}
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
    <div class="w-full max-w-md bg-gray-800 rounded-2xl shadow-xl p-6 space-y-6">

      <h1 class="text-2xl font-bold text-center">🎲 Монополия Онлайн</h1>

      <!-- 🔐 Блок авторизации -->
      <div class="flex items-center justify-between bg-gray-700/50 rounded-lg p-3">
        <template v-if="auth.isAuthenticated.value">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-green-500"></span>
            <span class="text-sm font-medium">{{ auth.user.value?.nickname }}</span>
          </div>
          <button @click="auth.logout" class="text-xs text-red-400 hover:text-red-300 underline">Выйти</button>
        </template>
        <button v-else @click="showAuthModal = true" class="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition">
          🔐 Войти / Регистрация
        </button>
      </div>

      <!-- 🎮 ЭКРАН КОМНАТЫ -->
      <div v-if="isInRoom" class="space-y-4">
        <div class="text-center">
          <h2 class="text-xl font-bold text-green-400">🚪 Комната: {{ session.roomId }}</h2>
          <p class="text-sm text-gray-400 mt-1">Ожидание игроков и готовности</p>
        </div>

        <div class="bg-gray-700/50 rounded-lg p-4 space-y-2">
          <h3 class="text-sm font-semibold text-gray-300">Игроки ({{ store.players.length }}/4)</h3>
          <div v-for="p in store.players" :key="p.id" class="flex items-center justify-between bg-gray-800/60 p-2 rounded">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full" :class="p.id === session.myId.value ? 'bg-blue-500' : 'bg-gray-400'"></span>
              <span class="font-medium">{{ p.name }} <span v-if="p.id === session.myId.value" class="text-xs text-blue-400">(Вы)</span></span>
            </div>
            <!-- 🔑 Берём статус напрямую из стора -->
            <span class="text-xs px-2 py-1 rounded" :class="p.isReady ? 'bg-green-600/20 text-green-400' : 'bg-gray-600/20 text-gray-400'">
              {{ p.isReady ? '✅ Готов' : '⏳ Ожидание' }}
            </span>
          </div>
        </div>

        <div class="flex gap-2">
          <button @click="toggleReady" class="flex-1 py-2.5 rounded-lg font-semibold transition" :class="isMyReady ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'">
            {{ isMyReady ? '❌ Отменить' : '✅ Я готов' }}
          </button>
          <button v-if="isHost" @click="startGame" :disabled="!canStart" class="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition">
            🚀 Начать игру
          </button>
        </div>

        <button @click="leaveRoom" class="w-full py-2 bg-red-900/50 hover:bg-red-900/80 text-red-300 rounded-lg text-sm transition">
          🚪 Покинуть комнату
        </button>
      </div>

      <!-- 🌐 ЭКРАН ВЫБОРА КОМНАТ -->
      <div v-else class="space-y-4">
        <div v-if="!auth.isAuthenticated.value">
          <label class="block text-sm text-gray-400 mb-1">Ваше имя</label>
          <input v-model="username" placeholder="Игрок123" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label class="block text-sm text-gray-400 mb-1">Название комнаты</label>
          <input v-model="roomName" placeholder="Room123" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <button @click="handleCreate" class="w-full py-2.5 bg-green-600 hover:bg-green-700 rounded-lg font-semibold transition">
          🏠 Создать комнату
        </button>

        <div class="pt-4 border-t border-gray-700">
          <h2 class="text-sm font-semibold text-gray-400 mb-2">Доступные комнаты</h2>
          <div v-if="!store.availableRooms?.length" class="text-gray-500 text-sm text-center py-4">Нет активных комнат</div>
          <div v-else class="space-y-2 max-h-48 overflow-y-auto">
            <div v-for="room in store.availableRooms" :key="room.id" class="flex items-center justify-between bg-gray-700/40 rounded-lg px-3 py-2">
              <div>
                <div class="font-medium">{{ room.id }}</div>
                <div class="text-xs text-gray-400">{{ room.players?.length || 0 }}/4 игроков</div>
              </div>
              <button @click="handleJoin(room.id)" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm transition">
                Войти
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 🔐 Модалка -->
      <Teleport to="body">
        <AuthModal v-if="showAuthModal" @close="handleAuthSuccess" />
      </Teleport>
    </div>
  </div>
</template>