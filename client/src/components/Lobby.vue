<!-- client/src/components/Lobby.vue -->
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useGameStore } from '../stores/game'
import { sendEvent } from '../lib/ws'
import { getPlayerColorHex } from '../shared/playerColors' // ✅ Импорт

const store = useGameStore()
const targetRoom = ref('')
const myId = ref('')

const username = ref(localStorage.getItem('monopoly_username') || '')
watch(username, (v) => localStorage.setItem('monopoly_username', v))

const generateId = () => {
  const id = `p_${Math.random().toString(36).slice(2, 8)}`
  myId.value = id
  return id
}

onMounted(() => {
  myId.value = localStorage.getItem('monopoly_player_id') || generateId()
  localStorage.setItem('monopoly_player_id', myId.value)
  sendEvent({ type: 'GET_LOBBY' })
})

const rooms = computed(() => store.availableRooms || [])
const isHost = (room: any) => room.createdBy === myId.value
const isInRoom = (room: any) => room.players.some((p: any) => p.id === myId.value)
const myStatus = (room: any) => room.players.find((p: any) => p.id === myId.value)
const allReady = (room: any) => room.players.every((p: any) => p.isReady || p.id === room.createdBy)

const joinRoom = (roomId: string) => {
  if (!username.value.trim()) { alert('Введите имя игрока'); return }
  sendEvent({ type: 'JOIN_ROOM', roomId, playerId: myId.value, name: username.value })
}

const toggleReady = (roomId: string) => {
  const p = rooms.value.find(r => r.id === roomId)?.players.find((pl: any) => pl.id === myId.value)
  if (!p) return
  sendEvent({ type: 'SET_READY', roomId, playerId: myId.value, isReady: !p.isReady })
}

const startGame = (roomId: string) => {
  sendEvent({ type: 'START_GAME', roomId, playerId: myId.value })
}

const fillSlots = (players: any[], max: number) => {
  const slots = players.map((p: any) => p)
  while (slots.length < max) slots.push(null)
  return slots
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white flex flex-col">
    <header class="p-6 border-b border-gray-700 flex justify-between items-center bg-gray-900/50 backdrop-blur">
      <h1 class="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">🎲 Monopoly</h1>
      <div class="flex items-center gap-4">
        <input v-model="username" class="px-3 py-1.5 bg-gray-700 rounded-lg text-sm border border-gray-600 focus:border-blue-500 outline-none" placeholder="Ваш ник" />
        <button @click="sendEvent({ type: 'GET_LOBBY' })" class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition">🔄 Обновить</button>
      </div>
    </header>

    <main class="flex-1 p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto w-full">
      <div class="lg:col-span-2 space-y-4">
        <h2 class="text-xl font-semibold mb-2 flex items-center gap-2">📡 Комнаты <span class="text-gray-500 text-sm font-normal">({{ rooms.length }})</span></h2>

        <div v-if="rooms.length === 0" class="bg-gray-800/50 rounded-xl p-8 text-center border border-gray-700 border-dashed">
          <p class="text-gray-400">Нет открытых комнат. Создайте новую справа 👉</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div v-for="room in rooms" :key="room.id" class="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-blue-500/50 transition flex flex-col">
            <div class="flex justify-between items-start mb-3">
              <span class="font-mono text-lg font-bold text-blue-400">🏠 {{ room.id }}</span>
              <span class="text-xs px-2 py-0.5 rounded bg-green-900/40 text-green-300 border border-green-800/50">
                {{ room.status === 'PLAYING' ? '🎮 В игре' : '⏳ Ожидание' }}
              </span>
            </div>

            <!-- Слоты игроков -->
            <div class="grid grid-cols-2 gap-2 mb-4">
              <div v-for="(slot, i) in fillSlots(room.players, room.maxPlayers)" :key="i"
                   class="p-3 rounded bg-gray-900/60 text-center border border-gray-700/50 flex flex-col items-center justify-center gap-2"
                   :class="slot ? 'border-blue-500/30 bg-blue-900/20' : 'border-dashed'">

                <div v-if="slot"
                     class="w-10 h-10 rounded-full border-2 border-white/90 shadow-md flex items-center justify-center text-lg font-bold text-white"
                     :style="{ backgroundColor: getPlayerColorHex(slot.color) }">
                  {{ slot.name?.charAt(0).toUpperCase() }}
                </div>
                <div v-else class="w-10 h-10 rounded-full border-2 border-dashed border-gray-600 flex items-center justify-center text-gray-500">
                  ?
                </div>

                <span class="font-medium text-white text-sm truncate w-full">{{ slot?.name || 'Свободно' }}</span>
                <span v-if="slot" class="text-xs px-1.5 rounded" :class="slot.isReady ? 'bg-green-900/50 text-green-300' : 'bg-yellow-900/50 text-yellow-300'">
                  {{ slot.isReady ? '✅ Готов' : '⏳ Ожидание' }}
                </span>
              </div>
            </div>

            <div class="text-xs text-gray-400 mb-3 flex justify-between">
              <span>💰 Баланс: 1500₽</span>
              <span>👥 {{ room.players.length }} / {{ room.maxPlayers }}</span>
            </div>

            <!-- Кнопки управления -->
            <div class="mt-auto">
              <template v-if="isHost(room) && room.status === 'LOBBY'">
                <div class="relative group">
                  <button @click="startGame(room.id)" :disabled="!allReady(room)"
                          class="w-full py-2.5 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition shadow-lg">
                    🚀 Начать игру
                  </button>
                  <div v-if="!allReady(room)" class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 text-gray-200 text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap border border-gray-700 z-10">
                    ⚠️ Дождитесь готовности всех игроков
                  </div>
                </div>
              </template>

              <template v-else-if="isInRoom(room) && room.status === 'LOBBY'">
                <button @click="toggleReady(room.id)"
                        class="w-full py-2.5 rounded-lg font-semibold transition border"
                        :class="myStatus(room)?.isReady ? 'bg-green-600/20 text-green-400 border-green-500/50' : 'bg-yellow-600/20 text-yellow-400 border-yellow-500/50 hover:bg-yellow-600/30'">
                  {{ myStatus(room)?.isReady ? '✅ Готов' : '⏳ Готов' }}
                </button>
              </template>

              <template v-else-if="room.status === 'LOBBY'">
                <button @click="joinRoom(room.id)"
                        class="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition shadow-lg">
                  👋 Присоединиться
                </button>
              </template>

              <button v-else disabled class="w-full py-2.5 bg-gray-700 text-gray-400 rounded-lg cursor-not-allowed">🔒 Закрыта</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Панель входа -->
      <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 h-fit sticky top-6">
        <h3 class="text-lg font-semibold mb-4">⚡ Войти или создать</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-gray-300 text-sm mb-1.5">Название комнаты</label>
            <input v-model="targetRoom" class="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Room123" />
          </div>
          <button @click="targetRoom.trim() ? joinRoom(targetRoom) : joinRoom('Room-' + Math.random().toString(36).slice(2,5))"
                  class="w-full py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-lg font-semibold transition shadow-lg">
            {{ targetRoom ? '🔗 Войти' : '🆕 Создать случайную' }}
          </button>
        </div>
        <p class="mt-4 text-xs text-gray-500 text-center">💡 Ник сохраняется автоматически</p>
      </div>
    </main>
  </div>
</template>