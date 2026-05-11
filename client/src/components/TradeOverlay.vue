<!-- client/src/components/TradeOverlay.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/game'
import { useSession } from '../composables/useSession'
import { getSpaceById } from '../shared/boardConfig'
import { sendEvent } from '../lib/ws'

const store = useGameStore()
const { myId } = useSession()

const trade = computed(() => store.activeTrade)
const isInitiator = computed(() => trade.value?.initiator === myId.value)
const myOffer = computed(() => isInitiator.value ? trade.value?.from : trade.value?.to)
const theirOffer = computed(() => isInitiator.value ? trade.value?.to : trade.value?.from)
const otherPlayer = computed(() => store.players.find(p => p.id === (isInitiator.value ? trade.value?.responder : trade.value?.initiator)))
const myPlayer = computed(() => store.players.find(p => p.id === myId.value))

const isProposed = computed(() => trade.value?.status === 'proposed')
const isMyTurnToRespond = computed(() => isProposed.value && trade.value?.lastProposer !== myId.value)

const getSpace = (id: number) => getSpaceById(id)
const myProperties = computed(() => myPlayer.value?.properties?.map(getSpace).filter(Boolean) || [])
// 🔑 Имущество ВТОРОГО игрока
const otherPlayerProperties = computed(() => otherPlayer.value?.properties?.map(getSpace).filter(Boolean) || [])

const toggleMyProp = (id: number) => {
  const list = [...(myOffer.value?.properties || [])]
  const idx = list.indexOf(id)
  if (idx === -1) list.push(id); else list.splice(idx, 1)
  sendEvent({ type: 'TRADE_EDIT', playerId: myId.value, side: isInitiator.value ? 'from' : 'to', offer: { ...myOffer.value, properties: list } })
}

// 🔑 Переключение имущества ВТОРОГО игрока
const toggleTheirProp = (id: number) => {
  const list = [...(theirOffer.value?.properties || [])]
  const idx = list.indexOf(id)
  if (idx === -1) list.push(id); else list.splice(idx, 1)

  const side = isInitiator.value ? 'to' : 'from'
  sendEvent({
    type: 'TRADE_EDIT', playerId: myId.value, side,
    offer: { properties: list, money: theirOffer.value?.money ?? 0, jailCards: 0 }
  })
}

const updateTheirMoney = (e: Event) => {
  const val = Number((e.target as HTMLInputElement).value)
  if (isNaN(val) || val < 0) return

  const side = isInitiator.value ? 'to' : 'from'
  sendEvent({
    type: 'TRADE_EDIT', playerId: myId.value, side,
    offer: { ...theirOffer.value, money: val }
  })
}
</script>

<template>
  <div v-if="trade" class="p-4 md:p-6 w-full h-full flex flex-col">
    <!-- Шапка -->
    <div class="flex justify-between items-center mb-4 pb-2 border-b border-gray-300">
      <h2 class="text-lg font-bold text-gray-900 flex items-center gap-2">🤝 Обмен <span class="text-sm font-normal text-gray-600">с {{ otherPlayer?.name }}</span></h2>
      <div class="px-3 py-1 rounded-full text-xs font-bold" :class="trade?.status === 'proposed'
             ? (isMyTurnToRespond ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' : 'bg-purple-100 text-purple-800 border border-purple-200')
             : 'bg-blue-100 text-blue-800 border border-blue-200 animate-pulse'">
        {{ trade?.status === 'proposed'
          ? (isMyTurnToRespond ? 'Ваш ход' : 'Ожидание...')
          : '📝 Подготовка...' }}
      </div>
    </div>

    <!-- Тело (2 колонки) -->
    <div class="flex-1 grid grid-cols-2 gap-4 min-h-0 overflow-hidden">
      <!-- 🔵 Моя сторона (Я отдаю) -->
      <div class="flex flex-col space-y-3 bg-white/90 backdrop-blur p-3 rounded-xl border border-gray-300 shadow-sm">
        <h3 class="font-semibold text-base border-b pb-1 text-gray-900">🟦 Я отдаю</h3>
        <div class="flex items-center gap-2 bg-gray-100 p-2 rounded">
          <span class="text-sm font-medium text-gray-700">💰 Моих денег:</span>
          <input type="number" :value="myOffer?.money ?? 0" @input="updateMyMoney" :disabled="isProposed && !isMyTurnToRespond" class="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm font-mono disabled:bg-gray-200 disabled:text-gray-500 text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none">
        </div>
        <div class="flex-1 grid grid-cols-2 gap-1.5 overflow-y-auto pr-1 custom-scroll">
          <label v-for="s in myProperties" :key="s.id" class="flex items-center gap-1 p-2 bg-gray-50 border border-gray-200 rounded cursor-pointer hover:bg-blue-50 transition select-none" :class="{ 'bg-blue-100 border-blue-400': myOffer?.properties.includes(s.id) }">
            <input type="checkbox" :checked="myOffer?.properties.includes(s.id)" @change="toggleMyProp(s.id)" :disabled="isProposed && !isMyTurnToRespond" class="cursor-pointer accent-blue-600">
            <span class="text-xs truncate text-gray-800 font-medium" :title="s.name">{{ s.name }}</span>
          </label>
          <div v-if="!myProperties.length" class="col-span-2 text-center text-gray-500 text-sm py-4">Нет имущества</div>
        </div>
      </div>

      <!-- 🔴 Сторона второго игрока (Прошу от них) -->
      <div class="flex flex-col space-y-3 bg-white/90 backdrop-blur p-3 rounded-xl border border-gray-300 shadow-sm">
        <h3 class="font-semibold text-base border-b pb-1 text-gray-900">🟥 Прошу от {{ otherPlayer?.name }}</h3>
        <div class="flex items-center gap-2 bg-gray-100 p-2 rounded">
          <span class="text-sm font-medium text-gray-700">💰 Запросят денег:</span>
          <input type="number" :value="theirOffer?.money ?? 0" @input="updateTheirMoney" :disabled="isProposed && !isMyTurnToRespond" class="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm font-mono disabled:bg-gray-200 disabled:text-gray-500 text-gray-900 focus:ring-2 focus:ring-red-500 outline-none">
        </div>
        <div class="flex-1 grid grid-cols-2 gap-1.5 overflow-y-auto pr-1 custom-scroll">
          <label v-for="s in otherPlayerProperties" :key="s.id" class="flex items-center gap-1 p-2 bg-gray-50 border border-gray-200 rounded cursor-pointer hover:bg-red-50 transition select-none" :class="{ 'bg-red-100 border-red-400': theirOffer?.properties.includes(s.id) }">
            <input type="checkbox" :checked="theirOffer?.properties.includes(s.id)" @change="toggleTheirProp(s.id)" :disabled="isProposed && !isMyTurnToRespond" class="cursor-pointer accent-red-600">
            <span class="text-xs truncate text-gray-800 font-medium" :title="s.name">{{ s.name }}</span>
          </label>
          <div v-if="!otherPlayerProperties.length" class="col-span-2 text-center text-gray-500 text-sm py-4">У игрока нет имущества</div>
        </div>
      </div>
    </div>

    <!-- 🔜 Чат обмена (заготовка) -->
    <div class="mt-3 p-2 bg-gray-100 border border-dashed border-gray-300 rounded-lg text-center text-gray-600 text-xs shrink-0">
      💬 Чат обмена (будет добавлен в следующем шаге)
    </div>

    <!-- Футер -->
    <div class="mt-3 flex gap-2 justify-end pt-2 border-t border-gray-300 shrink-0">
      <button v-if="!isProposed" @click="sendEvent({ type: 'TRADE_DECLINE', playerId: myId })" class="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm rounded transition font-medium">Отмена</button>
      <template v-if="isProposed && isMyTurnToRespond">
        <button @click="sendEvent({ type: 'TRADE_DECLINE', playerId: myId })" class="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded transition font-medium">Отклонить</button>
        <button @click="sendEvent({ type: 'TRADE_ACCEPT', playerId: myId })" class="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition shadow font-medium">Принять</button>
      </template>
      <button v-else @click="sendEvent({ type: 'TRADE_PROPOSE', playerId: myId })" :disabled="isProposed" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm rounded transition shadow font-medium">
        {{ isMyTurnToRespond ? 'Контр-предложить' : 'Отправить' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.custom-scroll::-webkit-scrollbar { width: 4px; }
.custom-scroll::-webkit-scrollbar-track { background: transparent; }
.custom-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
</style>