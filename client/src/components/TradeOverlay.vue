<!-- client/src/components/TradeOverlay.vue -->
<script setup lang="ts">
import { computed, watch, ref } from 'vue'
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

const hasMadeChanges = ref(false)

// Сбрасываем флаг, когда приходит новое предложение от соперника
watch(
    () => trade.value?.lastProposer,
    (lastProposer) => {
      if (trade.value?.status === 'proposed' && lastProposer !== myId.value) {
        hasMadeChanges.value = false
      }
    }
)

const getSpace = (id: number) => getSpaceById(id)
const myProperties = computed(() => myPlayer.value?.properties?.map(getSpace).filter(Boolean) || [])
const otherPlayerProperties = computed(() => otherPlayer.value?.properties?.map(getSpace).filter(Boolean) || [])

const toggleMyProp = (id: number) => {
  hasMadeChanges.value = true // 🔑 Помечаем как изменённое
  const list = [...(myOffer.value?.properties || [])]
  const idx = list.indexOf(id)
  if (idx === -1) list.push(id); else list.splice(idx, 1)
  sendEvent({ type: 'TRADE_EDIT', playerId: myId.value, side: isInitiator.value ? 'from' : 'to', offer: { ...myOffer.value, properties: list } })
}

const toggleTheirProp = (id: number) => {
  hasMadeChanges.value = true // 🔑 Помечаем как изменённое
  const list = [...(theirOffer.value?.properties || [])]
  const idx = list.indexOf(id)
  if (idx === -1) list.push(id); else list.splice(idx, 1)
  const side = isInitiator.value ? 'to' : 'from'
  sendEvent({ type: 'TRADE_EDIT', playerId: myId.value, side, offer: { ...theirOffer.value, properties: list } })
}

const updateMoney = (side: 'my' | 'their', e: Event) => {
  hasMadeChanges.value = true // 🔑 Помечаем как изменённое
  const val = Number((e.target as HTMLInputElement).value)
  if (isNaN(val) || val < 0) return
  const data = side === 'my' ? myOffer.value : theirOffer.value
  const targetSide = isInitiator.value ? (side === 'my' ? 'from' : 'to') : (side === 'my' ? 'to' : 'from')
  sendEvent({ type: 'TRADE_EDIT', playerId: myId.value, side: targetSide, offer: { ...data, money: val } })
}
</script>

<template>
  <div v-if="trade" class="p-4 md:p-6 w-full h-full flex flex-col">
    <!-- Шапка -->
    <div class="flex justify-between items-center mb-4 pb-2 border-b border-gray-300">
      <h2 class="text-lg font-bold text-gray-900 flex items-center gap-2">🤝 Обмен <span class="text-sm font-normal text-gray-600">с {{ otherPlayer?.name }}</span></h2>
      <div class="px-3 py-1 rounded-full text-xs font-bold border"
           :class="trade?.status === 'proposed'
             ? (isMyTurnToRespond ? 'bg-green-100 text-green-800 border-green-200 animate-pulse' : 'bg-purple-100 text-purple-800 border-purple-200')
             : 'bg-blue-100 text-blue-800 border-blue-200'">
        {{ trade?.status === 'proposed'
          ? (isMyTurnToRespond ? 'Ваш ход: примите или измените' : 'Ожидание ответа...')
          : '📝 Черновик' }}
      </div>
    </div>

    <!-- Тело -->
    <div class="flex-1 grid grid-cols-2 gap-4 min-h-0 overflow-hidden">
      <!-- Моя сторона -->
      <div class="flex flex-col space-y-3 bg-white/90 backdrop-blur p-3 rounded-xl border border-gray-300 shadow-sm">
        <h3 class="font-semibold text-base border-b pb-1 text-gray-900">🟦 Я отдаю</h3>
        <div class="flex items-center gap-2 bg-gray-100 p-2 rounded">
          <span class="text-sm font-medium text-gray-700">💰 Моих денег:</span>
          <input type="number" :value="myOffer?.money ?? 0" @input="updateMoney('my', $event)" :disabled="isProposed && !isMyTurnToRespond" class="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm font-mono disabled:bg-gray-200 disabled:text-gray-500 text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none">
        </div>
        <div class="flex-1 grid grid-cols-2 gap-1.5 overflow-y-auto pr-1 custom-scroll">
          <label v-for="s in myProperties" :key="s.id" class="flex items-center gap-1 p-2 bg-gray-50 border border-gray-200 rounded cursor-pointer hover:bg-blue-50 transition select-none" :class="{ 'bg-blue-100 border-blue-400': myOffer?.properties.includes(s.id) }">
            <input type="checkbox" :checked="myOffer?.properties.includes(s.id)" @change="toggleMyProp(s.id)" :disabled="isProposed && !isMyTurnToRespond" class="cursor-pointer accent-blue-600">
            <span class="text-xs truncate text-gray-800 font-medium" :title="s.name">{{ s.name }}</span>
          </label>
        </div>
      </div>

      <!-- Сторона соперника -->
      <div class="flex flex-col space-y-3 bg-white/90 backdrop-blur p-3 rounded-xl border border-gray-300 shadow-sm">
        <h3 class="font-semibold text-base border-b pb-1 text-gray-900">🟥 Прошу от {{ otherPlayer?.name }}</h3>
        <div class="flex items-center gap-2 bg-gray-100 p-2 rounded">
          <span class="text-sm font-medium text-gray-700">💰 Запросят денег:</span>
          <input type="number" :value="theirOffer?.money ?? 0" @input="updateMoney('their', $event)" :disabled="isProposed && !isMyTurnToRespond" class="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm font-mono disabled:bg-gray-200 disabled:text-gray-500 text-gray-900 focus:ring-2 focus:ring-red-500 outline-none">
        </div>
        <div class="flex-1 grid grid-cols-2 gap-1.5 overflow-y-auto pr-1 custom-scroll">
          <label v-for="s in otherPlayerProperties" :key="s.id" class="flex items-center gap-1 p-2 bg-gray-50 border border-gray-200 rounded cursor-pointer hover:bg-red-50 transition select-none" :class="{ 'bg-red-100 border-red-400': theirOffer?.properties.includes(s.id) }">
            <input type="checkbox" :checked="theirOffer?.properties.includes(s.id)" @change="toggleTheirProp(s.id)" :disabled="isProposed && !isMyTurnToRespond" class="cursor-pointer accent-red-600">
            <span class="text-xs truncate text-gray-800 font-medium" :title="s.name">{{ s.name }}</span>
          </label>
        </div>
      </div>
    </div>

    <!-- Чат (заготовка) -->
    <div class="mt-3 p-2 bg-gray-100 border border-dashed border-gray-300 rounded-lg text-center text-gray-600 text-xs shrink-0">
      💬 Чат обмена (будет добавлен в следующем шаге)
    </div>

    <!-- 🔑 Футер с ДИНАМИЧЕСКИМИ кнопками -->
    <!-- 🔑 Футер с динамическими кнопками -->
    <div class="mt-3 flex gap-2 justify-end pt-2 border-t border-gray-300 shrink-0">

      <!-- 1️⃣ Черновик -->
      <template v-if="trade?.status === 'draft'">
        <button @click="sendEvent({ type: 'TRADE_DECLINE', playerId: myId })" class="px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white text-sm rounded transition font-medium">Отменить</button>
        <button @click="sendEvent({ type: 'TRADE_PROPOSE', playerId: myId })" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition shadow font-medium">📤 Предложить обмен</button>
      </template>

      <!-- 2️⃣ Получено предложение от соперника -->
      <template v-else-if="trade?.status === 'proposed' && trade?.lastProposer !== myId">
        <button @click="sendEvent({ type: 'TRADE_DECLINE', playerId: myId })" class="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm rounded transition font-medium">Отклонить</button>

        <!-- ✅ Кнопка "Принять" показывается ТОЛЬКО если игрок ничего не менял -->
        <button v-if="!hasMadeChanges"
                @click="sendEvent({ type: 'TRADE_ACCEPT', playerId: myId })"
                class="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition shadow font-medium">
          ✅ Принять обмен
        </button>

        <!-- 📤 Если изменил → кнопка меняется на контр-предложение -->
        <button v-else
                @click="sendEvent({ type: 'TRADE_PROPOSE', playerId: myId })"
                class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded transition shadow font-medium">
          📤 Предложить изменения
        </button>
      </template>

      <!-- 3️⃣ Ожидание ответа (мое предложение висит) -->
      <template v-else>
        <div class="px-3 py-1.5 bg-gray-400 text-white text-sm rounded font-medium animate-pulse">⏳ Ожидание ответа...</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.custom-scroll::-webkit-scrollbar { width: 4px; }
.custom-scroll::-webkit-scrollbar-track { background: transparent; }
.custom-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
</style>