<!-- client/src/components/Lobby.vue -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useGameStore } from '../stores/game'
import { useSession } from '../composables/useSession'
import { sendEvent } from '../lib/ws'
import NicknameForm from './NicknameForm.vue'

const store = useGameStore()
const { myId, roomId, playerName, clearSession, ensureSession, setPlayerName } = useSession()

const showNicknameForm = computed(() => !playerName.value)
const roomName = ref('')

// 🔹 Надёжная проверка: показываем aside, если мы в LOBBY и наш ID есть в списке игроков
const isInRoom = computed(() => {
  const currentMyId = myId.value || sessionStorage.getItem('monopoly_playerId')
  const result = store.status === 'LOBBY' &&
      !!currentMyId &&
      store.players.some(p => p.id === currentMyId)
  console.log('🔍 [UI] isInRoom:', result, '| players:', store.players.length, '| myId:', currentMyId)
  return result
})

const displayRoomId = computed(() => store.currentRoomId || roomId.value || sessionStorage.getItem('monopoly_roomId') || '...')

const me = computed(() => {
  const currentMyId = myId.value || sessionStorage.getItem('monopoly_playerId')
  return store.players.find(p => p.id === currentMyId)
})
const isMyReady = computed(() => me.value?.isReady ?? false)
const isHost = computed(() => store.players.length > 0 && store.players[0]?.id === (myId.value || sessionStorage.getItem('monopoly_playerId')))
const canStart = computed(() => {
  const currentMyId = myId.value || sessionStorage.getItem('monopoly_playerId')
  return isHost.value && store.players.length >= 2 && store.players.every(p => p.isReady || p.id === currentMyId)
})

onMounted(() => {
  ensureSession()
  console.log('🚀 [LOBBY] Mounted:', { playerName: playerName.value, myId: myId.value })
  if (playerName.value) {
    sendEvent({ type: 'GET_LOBBY', name: playerName.value })
  }
})

const handleCreate = () => {
  console.log('🎯 [CLICK] handleCreate')
  if (!roomName.value.trim() || !playerName.value) return
  sendEvent({ type: 'JOIN_ROOM', roomId: roomName.value.trim(), playerId: myId.value || undefined, name: playerName.value })
}

const handleJoin = (id: string) => {
  console.log('🎯 [CLICK] handleJoin:', id)
  if (!playerName.value) return
  sendEvent({ type: 'JOIN_ROOM', roomId: id, playerId: myId.value || undefined, name: playerName.value })
}

// 🔹 Кнопка "Готов" с логами на каждой строке
// 🔹 В Lobby.vue, замени toggleReady на:
const toggleReady = () => {
  console.log('🔘 [CLICK] toggleReady clicked')

  // 🔹 Берём roomId ИГРОВОГО СОСТОЯНИЯ (самый надёжный источник)
  const rId = store.currentRoomId || roomId.value || sessionStorage.getItem('monopoly_roomId')
  const pId = myId.value || sessionStorage.getItem('monopoly_playerId')

  console.log('🔍 [DEBUG] toggleReady data:', { rId, pId, isMyReady: isMyReady.value })

  if (!rId || !pId) {
    console.warn('⚠️ [toggleReady] Missing rId or pId. currentRoomId:', store.currentRoomId)
    return
  }

  console.log('📤 [WS] Sending SET_READY')
  sendEvent({ type: 'SET_READY', playerId: pId, roomId: rId, isReady: !isMyReady.value })
}

// 🔹 И startGame тоже обновим:
const startGame = () => {
  console.log('🚀 [CLICK] startGame clicked')
  const rId = store.currentRoomId || roomId.value || sessionStorage.getItem('monopoly_roomId')
  const pId = myId.value || sessionStorage.getItem('monopoly_playerId')

  if (!rId || !pId || !canStart.value) {
    console.warn('⚠️ [startGame] Conditions not met', { rId, pId, canStart: canStart.value })
    return
  }

  console.log('📤 [WS] Sending START_GAME')
  sendEvent({ type: 'START_GAME', playerId: pId, roomId: rId })
}

// 🔹 Кнопка "Начать игру" с логами

const leaveRoom = () => {
  console.log('🚪 [CLICK] leaveRoom clicked')
  clearSession()
  store.reset()
  sendEvent({ type: 'GET_LOBBY' })
}

const handleNicknameSubmit = (name: string) => {
  setPlayerName(name)
  ensureSession()
}
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white flex flex-col">
    <!-- 🔹 Форма ника -->
    <NicknameForm v-if="showNicknameForm" @submit="handleNicknameSubmit" />

    <!-- 🔹 Основной интерфейс -->
    <template v-else>
      <!-- Шапка -->
      <header class="bg-gray-800 border-b border-gray-700 px-6 py-3 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span class="text-2xl">🎲</span>
          <h1 class="text-xl font-bold">Монополия Онлайн</h1>
        </div>
        <div class="flex items-center gap-3 bg-gray-700/60 px-3 py-1.5 rounded-full border border-gray-600">
          <div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-sm">
            {{ playerName.charAt(0).toUpperCase() }}
          </div>
          <span class="text-sm font-medium">{{ playerName }}</span>
          <button @click="clearSession" class="text-xs text-red-400 hover:text-red-300 ml-1">Сменить ник</button>
        </div>
      </header>

      <main class="flex-1 flex overflow-hidden">
        <!-- 📋 Левая часть: Список комнат -->
        <div class="flex-1 p-6 overflow-y-auto">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold">Доступные комнаты</h2>
            <div class="flex gap-2">
              <input v-model="roomName" placeholder="Название комнаты..." class="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500" @keyup.enter="handleCreate" />
              <button @click="handleCreate" class="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition">Создать</button>
            </div>
          </div>

          <div v-if="!store.availableRooms || store.availableRooms.length === 0" class="text-center py-12 text-gray-500">
            Нет активных комнат
          </div>
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

        <!-- 🎮 Правая часть: Панель управления комнатой (ASIDE) -->
        <aside v-if="isInRoom" class="w-80 bg-gray-800 border-l border-gray-700 p-5 flex flex-col">
          <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">🚪 Комната <span class="text-blue-400">{{ displayRoomId }}</span></h2>

          <!-- Список игроков -->
          <div class="bg-gray-700/40 rounded-lg p-3 mb-4 space-y-2 flex-1 overflow-y-auto">
            <div v-for="p in store.players" :key="p.id" class="flex items-center justify-between text-sm">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full" :class="p.id === (myId || sessionStorage.getItem('monopoly_playerId')) ? 'bg-blue-500' : 'bg-gray-500'"></span>
                <span>{{ p.name }} <span v-if="p.id === (myId || sessionStorage.getItem('monopoly_playerId'))" class="text-xs text-blue-300">(Вы)</span></span>
              </div>
              <span class="text-xs" :class="p.isReady ? 'text-green-400' : 'text-gray-400'">{{ p.isReady ? '✅' : '⏳' }}</span>
            </div>
          </div>

          <!-- Кнопки -->
          <div class="space-y-2">
            <button
                @click="toggleReady"
                class="w-full py-2.5 rounded-lg font-medium transition"
                :class="isMyReady ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'"
            >
              {{ isMyReady ? '❌ Отменить готовность' : '✅ Я готов' }}
            </button>
            <button
                v-if="isHost"
                @click="startGame"
                :disabled="!canStart"
                class="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition"
            >
              🚀 Начать игру
            </button>
            <button
                @click="leaveRoom"
                class="w-full py-2 bg-red-900/40 hover:bg-red-900/70 text-red-300 rounded-lg text-sm transition"
            >
              🚪 Покинуть комнату
            </button>
          </div>
        </aside>
      </main>
    </template>
  </div>
</template>