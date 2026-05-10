<!-- client/src/components/LeftBar.vue -->
<script setup lang="ts">
import { useGameStore } from '../stores/game'
import { useSession } from '../composables/useSession'

const store = useGameStore()
const { myId } = useSession()

const props = defineProps<{
  hoveredOwnerId: string | null
  setHoveredOwnerId: (id: string | null) => void
}>()
</script>

<template>
  <aside class="h-full w-80 bg-gray-800/95 backdrop-blur border-r border-gray-700 flex flex-col p-5 overflow-y-auto">
    <h2 class="text-xl font-bold text-white mb-4 flex items-center gap-2">
      👥 Игроки <span class="text-gray-400 text-sm font-normal">({{ store.players.length }})</span>
    </h2>

    <div class="space-y-3 flex-1">
      <div
          v-for="p in store.players"
          :key="p.id"
          @mouseenter="props.setHoveredOwnerId(p.id)"
          @mouseleave="props.setHoveredOwnerId(null)"
          class="p-4 rounded-xl border transition-all duration-200 shadow-sm cursor-pointer select-none"
          :class="[
          p.id === myId ? 'bg-blue-600/20 border-blue-500/50 ring-1 ring-blue-500/30' : 'bg-gray-700/30 border-gray-600/50',
          store.currentTurn === p.id ? 'bg-green-600/20 border-green-500/50 ring-1 ring-green-500/30' : '',
          props.hoveredOwnerId === p.id ? 'scale-[1.02] ring-2 ring-white' : ''
        ]"
      >
        <div class="flex items-center gap-3 mb-3">
          <span class="w-5 h-5 rounded-full shadow-md border-2 border-white/40" :class="p.color"></span>
          <span class="font-semibold text-white text-lg">{{ p.name }}</span>
          <span v-if="p.id === myId" class="ml-auto text-xs bg-blue-500/30 text-blue-200 px-2 py-0.5 rounded-full">Вы</span>
        </div>

        <div class="flex items-center justify-between text-sm bg-gray-900/40 p-2 rounded-lg">
          <span class="text-gray-400">💰 Баланс</span>
          <span class="font-mono text-yellow-400 font-bold">${{ p.money }}</span>
        </div>

        <div class="flex items-center justify-between text-sm bg-gray-900/40 p-2 rounded-lg mt-1">
          <span class="text-gray-400">🏘 Собственность</span>
          <span class="font-mono text-white font-bold">{{ p.properties?.length || 0 }}</span>
        </div>

        <div v-if="store.currentTurn === p.id" class="mt-3 pt-3 border-t border-gray-600/50 flex items-center gap-2 text-green-400 text-sm font-semibold animate-pulse">
          🎲 Сейчас ходит
        </div>
      </div>
    </div>
  </aside>
</template>