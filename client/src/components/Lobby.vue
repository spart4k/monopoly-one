<!-- client/src/components/Lobby.vue -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useGameStore } from '../stores/game'
import { useAuth } from '../composables/useAuth'
import { useSession } from '../composables/useSession'
import { sendEvent } from '../lib/ws'
import AuthModal from './AuthModal.vue'
import NicknameForm from './NicknameForm.vue'  // 🔹 Добавь импорт

const store = useGameStore()
const auth = useAuth()

// 🔹 ИСПРАВЛЕНО: деструктурируем всё, что нужно
const { myId, roomId, playerName, clearSession, ensureSession, setPlayerName } = useSession()

// 🔹 Показываем форму ника, если имя не установлено
const showNicknameForm = computed(() => !playerName.value)

const roomName = ref('')
const showAuthModal = ref(false)

// 🔹 ИСПРАВЛЕНО: используем переменные напрямую (без session.)
const isInRoom = computed(() => !!roomId.value && store.status === 'LOBBY')
const me = computed(() => store.players.find(p => p.id === myId.value))
const isMyReady = computed(() => me.value?.isReady ?? false)
const isHost = computed(() => store.players.length > 0 && store.players[0].id === myId.value)
const canStart = computed(() => isHost.value && store.players.length >= 2 && store.players.every(p => p.isReady || p.id === myId.value))

onMounted(() => {
  ensureSession()
  // 🔹 Если ник есть — сразу запрашиваем лобби
})

// 🔹 ИСПРАВЛЕНО: используем myId, roomId, playerName напрямую
const handleCreate = () => {
  if (!roomName.value.trim() || isInRoom.value) return
  sendEvent({
    type: 'JOIN_ROOM',
    roomId: roomName.value.trim(),
    playerId: myId.value,
    name: playerName.value || 'Player'
  })
}

const handleJoin = (id: string) => {
  if (isInRoom.value) return
  sendEvent({
    type: 'JOIN_ROOM',
    roomId: id,
    playerId: myId.value,
    name: playerName.value || 'Player'
  })
}

const toggleReady = () => {
  if (isInRoom.value) {
    sendEvent({
      type: 'SET_READY',
      playerId: myId.value,
      roomId: roomId.value,
      isReady: !isMyReady.value
    })
  }
}

const startGame = () => {
  if (canStart.value) {
    sendEvent({
      type: 'START_GAME',
      playerId: myId.value,
      roomId: roomId.value
    })
  }
}

const leaveRoom = () => {
  clearSession()
  sendEvent({ type: 'GET_LOBBY' })
}

const handleAuthSuccess = () => {
  showAuthModal.value = false
}

// 🔹 Обработчик для формы ника
const handleNicknameSubmit = (name: string) => {
  setPlayerName(name)
  ensureSession()
  sendEvent({ type: 'GET_LOBBY', name })
}
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white flex flex-col">

    <!-- 🔹 Если нет ника → показываем форму -->
    <NicknameForm v-if="showNicknameForm" @submit="handleNicknameSubmit" />

    <!-- 🔹 Если ник есть → показываем лобби -->
    <template v-else>
      <header class="bg-gray-800 border-b border-gray-700 px-6 py-3 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span class="text-2xl">🎲</span>
          <h1 class="text-xl font-bold">Монополия Онлайн</h1>
        </div>
        <div class="flex items-center gap-3 bg-gray-700/60 px-3 py-1.5 rounded-full border border-gray-600">
          <div class="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center font-bold text-sm">
            {{ playerName.charAt(0).toUpperCase() }}
          </div>
          <span class="text-sm font-medium">{{ playerName }}</span>
          <button @click="clearSession()" class="text-xs text-red-400 hover:text-red-300 ml-1">Сменить</button>
        </div>
      </header>

      <main class="flex-1 flex overflow-hidden">
        <div class="flex-1 p-6 overflow-y-auto">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold">Доступные комнаты</h2>
            <div class="flex gap-2">
              <input v-model="roomName" placeholder="Название комнаты..." class="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-purple-500" @keyup.enter="handleCreate" />
              <button @click="handleCreate" class="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition">Создать</button>
            </div>
          </div>

          <div v-if="!store.availableRooms?.length" class="text-center py-12 text-gray-500">Нет активных комнат</div>
          <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div v-for="room in store.availableRooms" :key="room.id" class="bg-gray-800 border border-gray-700 rounded-xl p-4 hover:border-purple-500 transition cursor-pointer" @click="handleJoin(room.id)">
              <div class="flex items-center justify-between mb-2">
                <span class="font-bold text-lg">{{ room.id }}</span>
                <span class="text-xs px-2 py-0.5 rounded-full" :class="room.status === 'LOBBY' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'">
                  {{ room.status === 'LOBBY' ? '🟢 Ожидание' : '🟡 Игра' }}
                </span>
              </div>
              <div class="flex items-center gap-2 text-sm text-gray-400">
                <span>👤 {{ room.players?.length || 0 }}/4</span>
              </div>
              <button class="w-full mt-3 py-1.5 bg-gray-700 hover:bg-purple-600 rounded text-sm transition">Войти</button>
            </div>
          </div>
        </div>

        <aside v-if="isInRoom" class="w-80 bg-gray-800 border-l border-gray-700 p-5 flex flex-col">
          <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">🚪 Комната <span class="text-purple-400">{{ roomId }}</span></h2>
          <div class="bg-gray-700/40 rounded-lg p-3 mb-4 space-y-2">
            <div v-for="p in store.players" :key="p.id" class="flex items-center justify-between text-sm">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full" :class="p.id === myId ? 'bg-purple-500' : 'bg-gray-500'"></span>
                <span>{{ p.name }} <span v-if="p.id === myId" class="text-xs text-purple-300">(Вы)</span></span>
              </div>
              <span class="text-xs" :class="p.isReady ? 'text-green-400' : 'text-gray-400'">{{ p.isReady ? '✅' : '⏳' }}</span>
            </div>
          </div>
          <div class="space-y-2 mt-auto">
            <button @click="toggleReady" class="w-full py-2.5 rounded-lg font-medium transition" :class="isMyReady ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'">
              {{ isMyReady ? '❌ Отменить готовность' : '✅ Я готов' }}
            </button>
            <button v-if="isHost" @click="startGame" :disabled="!canStart" class="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition">
              🚀 Начать игру
            </button>
            <button @click="leaveRoom" class="w-full py-2 bg-red-900/40 hover:bg-red-900/70 text-red-300 rounded-lg text-sm transition">🚪 Покинуть комнату</button>
          </div>
        </aside>
      </main>

      <Teleport to="body">
        <AuthModal v-if="showAuthModal" @close="handleAuthSuccess" />
      </Teleport>
    </template>
  </div>
</template>