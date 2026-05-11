<!-- client/src/components/LeftBar.vue -->
<script setup lang="ts">
import { useGameStore } from '../stores/game'
import { getPlayerColorHex } from '../shared/playerColors'
import { useSession } from '../composables/useSession'
import { sendEvent } from '../lib/ws'
const store = useGameStore()
const { myId } = useSession()

</script>

<template>
  <aside class="w-72 bg-gray-900/95 border-r border-gray-700 p-4 flex flex-col gap-4">
    <h2 class="text-lg font-bold text-white flex items-center gap-2">👥 Игроки</h2>

    <div class="flex-1 space-y-2">
      <div v-for="p in store.players" :key="p.id"
           class="p-3 rounded-xl bg-gray-800/50 border border-gray-700/50 transition hover:bg-gray-800"
           :class="{ 'ring-2 ring-blue-500/50 bg-blue-900/20': p.id === store.currentTurn }">

        <div class="flex items-center gap-3">
          <!-- Фишка игрока -->
          <div class="w-8 h-8 rounded-full border-2 border-white/90 shadow-md flex items-center justify-center text-sm font-bold text-white shrink-0"
               :style="{ backgroundColor: getPlayerColorHex(p.color) }" :title="p.name">
            {{ p.name?.charAt(0).toUpperCase() }}
          </div>

          <div class="flex-1 min-w-0">
            <p class="font-medium text-white truncate">{{ p.name }}</p>
            <p class="text-xs text-gray-400 font-mono">💰 {{ p.money }}₽</p>
          </div>

          <button
              v-if="p.id !== myId && store.status === 'PLAYING' && !store.activeTrade"
              @click="sendEvent({ type: 'TRADE_INIT', playerId: myId, responder: p.id })"
              class="ml-auto px-2 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded transition"
              title="Предложить обмен"
          >💱</button>
          <span v-if="p.id === store.currentTurn" class="text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full border border-green-500/30 animate-pulse">🎲 Ход</span>
          <span v-if="p.isInJail" class="text-xs bg-red-500/20 text-red-300 px-2 py-0.5 rounded-full border border-red-500/30">
            🔒
          </span>
        </div>

        <div v-if="p.isInJail" class="mt-2 h-1 bg-gray-700 rounded-full overflow-hidden">
          <div class="h-full bg-red-500 transition-all" :style="{ width: `${(p.jailTurns / 3) * 100}%` }"></div>
        </div>
      </div>
    </div>
  </aside>
</template>