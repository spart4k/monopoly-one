<!-- client/src/components/LeftBar.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '../stores/game'
import { useSession } from '../composables/useSession'
import { getPlayerColorHex } from '../shared/playerColors'
import { sendEvent } from '../lib/ws'

const store = useGameStore()
const { myId } = useSession()
const tradeMenuId = ref<string | null>(null)

const openTrade = (responderId: string) => {
  sendEvent({ type: 'TRADE_INIT', playerId: myId.value, responder: responderId })
  tradeMenuId.value = null
}
</script>

<template>
  <aside class="w-72 bg-gray-900/95 border-r border-gray-700 p-4 flex flex-col gap-4 relative" @click="tradeMenuId = null">
    <h2 class="text-lg font-bold text-white flex items-center gap-2">👥 Игроки</h2>

    <div class="flex-1 space-y-2 overflow-y-auto">
      <div v-for="p in store.players" :key="p.id" class="p-3 rounded-xl bg-gray-800/50 border border-gray-700/50 transition hover:bg-gray-800 relative"
           :class="{ 'ring-2 ring-blue-500/50 bg-blue-900/20': p.id === store.currentTurn }">

        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-full border-2 border-white/90 shadow-md flex items-center justify-center text-sm font-bold text-white shrink-0"
               :style="{ backgroundColor: getPlayerColorHex(p.color) }" :title="p.name">
            {{ p.name?.charAt(0).toUpperCase() }}
          </div>
          <div class="flex-1 min-w-0">
            <p class="font-medium text-white truncate">{{ p.name }}</p>
            <p class="text-xs text-gray-400 font-mono">💰 {{ p.money }}₽</p>
          </div>

          <!-- 🔑 Кнопка обмена (только у ДРУГИХ игроков) -->
          <div v-if="p.id !== myId" class="relative">
            <button @click.stop="tradeMenuId = tradeMenuId === p.id ? null : p.id"
                    class="px-2 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded transition">
              💱
            </button>
            <!-- Контекстное меню -->
            <div v-if="tradeMenuId === p.id" class="absolute right-0 top-full mt-1 w-44 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 overflow-hidden animate-fade-in">
              <button @click="openTrade(p.id)" class="w-full px-3 py-2 text-left text-sm text-white hover:bg-gray-700 flex items-center gap-2 border-b border-gray-700">
                🤝 Предложить обмен
              </button>
            </div>
          </div>

          <span v-if="p.id === store.currentTurn" class="text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full border border-green-500/30 animate-pulse">🎲 Ход</span>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
@keyframes fade-in { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
.animate-fade-in { animation: fade-in 0.15s ease-out; }
</style>