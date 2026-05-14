<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/game'
import { useSession } from '../composables/useSession'
import { sendEvent } from '../lib/ws'

const store = useGameStore()
const { myId } = useSession()
const emit = defineEmits<{ close: [] }>()

const isWinner = computed(() => store.winnerId === myId.value)
const message = computed(() =>
    isWinner.value
        ? '🏆 Поздравляем! Вы победили!'
        : store.winnerName
            ? `😔 Игра окончена. Победил ${store.winnerName}`
            : '😔 Игра окончена. Ничья.'
)

const handleBackToLobby = () => {
  sendEvent({ type: 'GET_LOBBY' })
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="store.gameOver" class="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
          <div class="p-6 text-center" :class="isWinner ? 'bg-gradient-to-r from-yellow-400 to-amber-500' : 'bg-gradient-to-r from-gray-600 to-gray-700'">
            <div class="text-6xl mb-2">{{ isWinner ? '👑' : '🏁' }}</div>
            <h2 class="text-2xl font-bold text-white">{{ isWinner ? 'Победа!' : 'Игра окончена' }}</h2>
          </div>

          <div class="p-6 text-center space-y-4">
            <p class="text-lg text-gray-700">{{ message }}</p>
            <div class="bg-gray-50 rounded-lg p-4 text-left space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-gray-500">Ваш баланс:</span>
                <span class="font-mono font-semibold">{{ store.players.find(p => p.id === myId)?.money || 0 }}₽</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-gray-500">Владений:</span>
                <span class="font-mono font-semibold">{{ store.players.find(p => p.id === myId)?.properties.length || 0 }}</span>
              </div>
            </div>
          </div>

          <div class="p-4 bg-gray-50 border-t flex gap-3">
            <button @click="handleBackToLobby" class="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition">🔄 В лобби</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>