<!-- client/src/components/MonopolyBoard.vue -->
<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useGameStore } from '../stores/game'
import { useSession } from '../composables/useSession'
import { getSpaceById } from '../shared/boardConfig'
import type { ISpaceData } from '../shared/boardConfig'
import { getPlayerColorHex } from '../shared/playerColors'
import LeftBar from './LeftBar.vue'
import PropertyModal from './PropertyModal.vue'
import { sendEvent, isWsReady } from '../lib/ws'

const store = useGameStore()
const { myId } = useSession()

const isMyTurn = computed(() => !!store.currentTurn && !!myId.value && store.currentTurn === myId.value)
const currentPlayer = computed(() => store.players.find(p => p.id === store.currentTurn))
const isInJail = computed(() => currentPlayer.value?.isInJail || false)

const hoveredOwnerId = ref<string | null>(null)
const hoveredGroupColor = ref<string | null>(null)
const selectedSpace = ref<ISpaceData | null>(null)
const showModal = ref(false)
const debugTarget = ref<number | null>(null)
const chatContainer = ref<HTMLElement | null>(null)
const boughtHouseThisTurn = ref(false)

// 🎨 Группы цветов (безопасная инициализация)
const colorGroups: Record<string, number[]> = {}
try {
  for (let i = 0; i < 40; i++) {
    const s = getSpaceById(i)
    if (s?.type === 'property' && s.color) {
      if (!colorGroups[s.color]) colorGroups[s.color] = []
      colorGroups[s.color].push(i)
    }
  }
} catch (e) { console.warn('⚠️ [BOARD] colorGroups init failed:', e) }

const canBuyHouse = computed(() => {
  if (!selectedSpace.value || selectedSpace.value.type !== 'property') return false
  const me = store.players.find(p => p.id === myId.value)
  if (!me) return false
  const group = colorGroups[selectedSpace.value.color]
  if (!group || !group.every(id => me.properties.includes(id))) return false
  if (me.money < (selectedSpace.value.houseCost || 100)) return false
  const current = me.houses?.[selectedSpace.value.id] || 0
  if (current >= 5) return false
  const others = group.filter(id => id !== selectedSpace.value.id).map(id => me.houses?.[id] || 0)
  const minOthers = others.length ? Math.min(...others) : 0
  return current <= minOthers && !boughtHouseThisTurn.value
})

const canSellHouse = computed(() => {
  if (!selectedSpace.value || selectedSpace.value.type !== 'property') return false
  const me = store.players.find(p => p.id === myId.value)
  if (!me) return false
  const group = colorGroups[selectedSpace.value.color]
  if (!group || !group.every(id => me.properties.includes(id))) return false
  const current = me.houses?.[selectedSpace.value.id] || 0
  if (current === 0) return false
  const others = group.filter(id => id !== selectedSpace.value.id).map(id => me.houses?.[id] || 0)
  const maxOthers = others.length ? Math.max(...others) : 0
  return current >= maxOthers
})

watch(() => store.currentTurn, () => { boughtHouseThisTurn.value = false })
watch(() => store.pendingAction, (action) => { if (action === 'DOUBLE_TURN') boughtHouseThisTurn.value = false })

const ownerMap = computed(() => {
  const map: Record<number, string> = {}
  store.players.forEach(p => p.properties?.forEach(id => { map[id] = p.id }))
  return map
})

// 🔑 Безопасная генерация клеток (игнорирует undefined)
const spaces = Array.from({ length: 40 }, (_, i) => getSpaceById(i)).filter(Boolean) as ISpaceData[]

const getPos = (i: number) => {
  if (i <= 10) return { row: 11, col: 11 - i }
  if (i <= 19) return { row: 21 - i, col: 1 }
  if (i <= 30) return { row: 1, col: i - 19 }
  return { row: i - 29, col: 11 }
}

const rollDice = () => {
  if (!myId.value || !isMyTurn.value) return
  if (store.status !== 'PLAYING') return
  if (store.pendingAction && store.pendingAction !== 'DOUBLE_TURN') return
  sendEvent({ type: 'ROLL_DICE', playerId: myId.value, targetSpaceId: debugTarget.value || undefined })
}

const openSpaceInfo = (id: number) => {
  const data = getSpaceById(id)
  if (data) { selectedSpace.value = data; showModal.value = true }
}

const handleTileHover = (space: ISpaceData) => { if (space.type === 'property' && space.color) hoveredGroupColor.value = space.color }
const clearTileHover = () => { hoveredGroupColor.value = null }

const handleBuyProperty = () => { if (!selectedSpace.value || !myId.value) return; sendEvent({ type: 'BUY_PROPERTY', playerId: myId.value, spaceId: selectedSpace.value.id }); showModal.value = false; store.clearPendingAction() }
const handlePassAction = () => { if (!myId.value) return; sendEvent({ type: 'PASS_ACTION', playerId: myId.value }); showModal.value = false; store.clearPendingAction() }
const handlePayJailFine = () => { if (!myId.value) return; sendEvent({ type: 'PAY_JAIL_FINE', playerId: myId.value }); showModal.value = false }
const handleUseJailCard = () => { if (!myId.value) return; sendEvent({ type: 'USE_JAIL_CARD', playerId: myId.value }); showModal.value = false }
const handleJailRoll = () => { if (!myId.value) return; sendEvent({ type: 'ROLL_DICE', playerId: myId.value }) }
const handleBuyHouse = (spaceId: number) => { if (!myId.value || !canBuyHouse.value) return; boughtHouseThisTurn.value = true; sendEvent({ type: 'BUY_HOUSE', playerId: myId.value, spaceId }) }
const handleSellHouse = (spaceId: number) => { if (!myId.value || !canSellHouse.value) return; sendEvent({ type: 'SELL_HOUSE', playerId: myId.value, spaceId }) }

const getPlayerName = (id: string) => store.players.find(p => p.id === id)?.name || '...'
const getPendingText = () => {
  switch (store.pendingAction) {
    case 'BUY': return 'Купите улицу или пропустите...'
    case 'CARD': return 'Прочитайте карту...'
    case 'INFO': return 'Подтвердите действие...'
    default: return 'Завершите действие...'
  }
}

watch(() => store.pendingAction, (action) => {
  if (!action || !isMyTurn.value) return
  if (action === 'DOUBLE_TURN') return
  if (action === 'BUY' && store.selectedSpaceId !== null) {
    const data = getSpaceById(store.selectedSpaceId)
    if (data) { selectedSpace.value = data; showModal.value = true }
  } else if (action === 'CARD') {
    selectedSpace.value = { id: 7, name: '🃏 Событие', type: 'chance', color: 'bg-orange-200', textColor: 'text-orange-900', price: 0, baseRent: 0, rentWithHouse: [0,0,0,0], rentWithHotel: 0, houseCost: 0, mortgageValue: 0 }
    showModal.value = true
  } else if (action === 'INFO') {
    selectedSpace.value = { id: -1, name: '', type: 'go', color: 'bg-gray-200', textColor: 'text-gray-800', price: 0, baseRent: 0, rentWithHouse: [0,0,0,0], rentWithHotel: 0, houseCost: 0, mortgageValue: 0 }
    showModal.value = true
  }
})

watch(() => store.logs.length, async () => {
  await nextTick()
  if (chatContainer.value) chatContainer.value.scrollTo({ top: chatContainer.value.scrollHeight, behavior: 'smooth' })
})
</script>

<template>
  <div class="h-screen w-screen bg-gray-900 flex overflow-hidden">
    <LeftBar :hovered-owner-id="hoveredOwnerId" :set-hovered-owner-id="(id) => hoveredOwnerId = id" />

    <main class="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden">
      <div class="relative w-full max-w-5xl aspect-square bg-white rounded-2xl shadow-2xl overflow-hidden grid grid-cols-11 grid-rows-11 gap-1 p-2 border-4 border-gray-800">

        <div v-for="space in spaces" :key="space.id" @click="openSpaceInfo(space.id)" @mouseenter="handleTileHover(space)" @mouseleave="clearTileHover()"
             class="relative border border-gray-300/50 flex flex-col items-center justify-center text-[10px] md:text-xs font-medium select-none cursor-pointer transition-all duration-150"
             :class="[space.color || 'bg-gray-200', space.textColor, space.type === 'corner' ? 'font-bold bg-gray-200' : '', ownerMap[space.id] === hoveredOwnerId ? 'ring-2 ring-white scale-[1.03] z-10 brightness-110' : '', hoveredGroupColor && space.color === hoveredGroupColor && space.type === 'property' ? 'brightness-125 ring-1 ring-yellow-400 z-10' : 'hover:brightness-95']"
             :style="`grid-row: ${getPos(space.id).row}; grid-column: ${getPos(space.id).col};`">

          <span class="text-center leading-tight px-0.5 break-words font-semibold">{{ space.name }}</span>
          <span v-if="space.price > 0" class="text-[9px] font-mono text-gray-600 mt-0.5 bg-white/50 px-1 rounded">{{ space.price }}₽</span>

          <!-- 🔑 ИНДИКАТОРЫ ДОМОВ/ОТЕЛЕЙ НА КЛЕТКЕ -->
          <div v-if="space.type === 'property' && ownerMap[space.id]" class="absolute top-1 left-1 flex gap-0.5 z-20">
            <template v-for="h in (store.players.find(p => p.id === ownerMap[space.id])?.houses?.[space.id] || 0)" :key="h">
              <span v-if="h < 5" class="text-[10px] drop-shadow-sm">🏠</span>
              <span v-else class="text-[10px] drop-shadow-sm">🏨</span>
            </template>
          </div>

          <div v-if="ownerMap[space.id]" class="absolute top-1 right-1 w-2 h-2 rounded-full ring-1 ring-white/50" :class="store.players.find(p => p.id === ownerMap[space.id])?.color || 'bg-gray-500'"></div>
          <div class="absolute bottom-1 flex gap-1">
            <div v-for="p in store.players.filter(pl => pl.pos === space.id)" :key="p.id" class="w-5 h-5 rounded-full border-2 border-white/90 shadow-md flex items-center justify-center text-[9px] font-bold text-white select-none" :style="{ backgroundColor: getPlayerColorHex(p.color) }" :title="p.name">{{ p.name?.charAt(0).toUpperCase() }}</div>
          </div>
        </div>

        <div class="col-start-2 col-span-9 row-start-2 row-span-9 bg-gray-50 text-gray-800 flex flex-col items-center justify-center p-6 rounded-2xl gap-4">
          <div class="flex gap-4 bg-white px-6 py-3 rounded-xl shadow-md border border-gray-200">
            <div v-for="(d, i) in store.lastDice" :key="i" class="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center font-bold text-3xl text-gray-800 shadow-inner">{{ d }}</div>
          </div>

          <div class="flex flex-col items-center gap-3 w-full">

            <!-- Основная кнопка броска -->
            <button
                @click="rollDice"
                :disabled="
                  store.status !== 'PLAYING' ||
                  !isMyTurn ||
                  (store.pendingAction !== null && store.pendingAction !== 'DOUBLE_TURN') ||
                  (isInJail && !store.pendingAction) ||
                  !isWsReady()
                "
                class="w-72 px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition active:scale-95 shadow-lg text-lg flex items-center justify-center gap-2"
            >
              <span v-if="store.pendingAction === 'DOUBLE_TURN' && isMyTurn">🎲 Бросить снова (дубль)!</span>
              <span v-else-if="isInJail && isMyTurn && !store.pendingAction">🔒 Вы в тюрьме</span>
              <span v-else-if="store.pendingAction !== null">⏳ {{ getPendingText() }}</span>
              <span v-else-if="isMyTurn">🎲 Бросить кубики</span>
              <span v-else>⏳ Ждите хода: {{ getPlayerName(store.currentTurn) }}</span>
            </button>

            <!-- 🔑 Кнопки выхода из тюрьмы (показываются ТОЛЬКО когда игрок в тюрьме и это его ход) -->
            <div v-if="isInJail && isMyTurn && !store.pendingAction" class="flex flex-col gap-2 w-72">
              <button
                  @click="handlePayJailFine"
                  :disabled="(store.players.find(p => p.id === myId)?.money || 0) < 50"
                  class="w-full px-4 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition text-sm"
              >
                💸 Заплатить 50₽
              </button>
              <button
                  @click="handleUseJailCard"
                  :disabled="(store.players.find(p => p.id === myId)?.jailCards || 0) < 1"
                  class="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition text-sm"
              >
                🎫 Использовать карту выхода
              </button>
              <button
                  @click="handleJailRoll"
                  class="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition text-sm"
              >
                🎲 Бросить на дубль ({{ (store.players.find(p => p.id === myId)?.jailTurns || 0) }}/3)
              </button>
            </div>

          </div>

          <div ref="chatContainer" class="w-full max-w-md h-96 overflow-y-auto bg-white rounded-lg p-3 text-xs font-mono space-y-1.5 border border-gray-200 shadow-inner scrollbar-thin">
            <div v-for="(log, i) in store.logs" :key="i" class="text-gray-600 border-b border-gray-100 pb-1 last:border-0">{{ log }}</div>
          </div>

          <p class="text-gray-500 text-base">Ход: <span class="font-semibold text-gray-800">{{ getPlayerName(store.currentTurn) }}</span></p>

          <!-- 🧪 Дебаг-селект: ВСЕ тестовые сценарии -->
          <div class="w-72 mt-1">
            <label class="text-[10px] font-semibold text-gray-400 mb-0.5 block text-center">🧪 Тест-сценарии:</label>
            <select v-model="debugTarget" class="w-full bg-gray-100 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option :value="null">🎲 Случайный бросок</option>

              <!-- 🃏 ШАНС (3 карты) -->
              <optgroup label="🃏 Шанс">
                <option :value="7">🃏 Шанс #7: "Отправляйтесь на пр. Кирова"</option>
                <option :value="22">🃏 Шанс #22: "Банковская ошибка +200₽"</option>
                <option :value="36">🃏 Шанс #36: "Штраф за скорость -15₽"</option>
              </optgroup>

              <!-- 💰 КАЗНА (3 карты) -->
              <optgroup label="💰 Казна">
                <option :value="2">💰 Казна #2: "Оплата врача -50₽"</option>
                <option :value="17">💰 Казна #17: "Вклад погашен +100₽"</option>
                <option :value="33">💰 Казна #33: "Карта 'Выход из тюрьмы'"</option>
              </optgroup>

              <!-- 🚔 ТЮРЬМА -->
              <optgroup label="🚔 Тюрьма">
                <option :value="10">🔓 Просто посетить тюрьму (не сесть)</option>
                <option :value="30">🚔 Отправиться в тюрьму (Go to Jail)</option>
              </optgroup>

              <!-- 📉 НАЛОГИ -->
              <optgroup label="📉 Налоги">
                <option :value="4">📉 Налог на роскошь (-200₽)</option>
                <option :value="38">📉 Подоходный налог (-100₽)</option>
              </optgroup>

              <!-- 🚂 Ж/Д и КОММУНАЛКИ -->
              <optgroup label="🚂 Транспорт">
                <option :value="5">🚂 Ж/Д Вокзал (200₽)</option>
                <option :value="15">🚂 Речной Вокзал (200₽)</option>
                <option :value="25">🚂 Автовокзал (200₽)</option>
                <option :value="35">🚂 Аэропорт (200₽)</option>
                <option :value="12">⚡ Водоканал (150₽)</option>
                <option :value="28">💡 Электросети (150₽)</option>
              </optgroup>

              <!-- 🏠 УЛИЦЫ ПО ЦВЕТАМ -->
              <optgroup label="🟤 Дешёвые (60-100₽)">
                <option :value="1">🟤 Ленинградская (60₽)</option>
                <option :value="3">🟤 Вилоновская (60₽)</option>
                <option :value="6">🔵 пр. Кирова (100₽)</option>
                <option :value="8">🔵 ул. Куйбышева (100₽)</option>
                <option :value="9">🔵 ул. Молодогвардейская (120₽)</option>
              </optgroup>

              <optgroup label="🟣 Средние (140-220₽)">
                <option :value="11">🟣 ул. Купеческая (140₽)</option>
                <option :value="13">🟣 Красноармейская (140₽)</option>
                <option :value="14">🟣 Галактионовская (140₽)</option>
                <option :value="16">🟠 ул. Полевая (180₽)</option>
                <option :value="18">🟠 Братьев Коростылевых (180₽)</option>
                <option :value="19">🟠 Аэродромная (200₽)</option>
                <option :value="21">🔴 Осипенко (220₽)</option>
                <option :value="23">🔴 Садовая (220₽)</option>
                <option :value="24">🔴 Стара-Загора (220₽)</option>
              </optgroup>

              <optgroup label="🟢 Дорогие (260-400₽)">
                <option :value="26">🟡 пр. Ленина (260₽)</option>
                <option :value="27">🟡 Спортивная (260₽)</option>
                <option :value="29">🟡 Арцыбушевская (280₽)</option>
                <option :value="31">🟢 Фрунзе (350₽)</option>
                <option :value="32">🟢 Советской Армии (350₽)</option>
                <option :value="34">🟢 Ульяновская (350₽)</option>
                <option :value="37">🔵 Советская (400₽)</option>
                <option :value="39">🔵 Советской Армии (400₽)</option>
              </optgroup>

              <!-- 🎯 БЫСТРЫЕ СЦЕНАРИИ -->
              <optgroup label="⚡ Быстрые тесты">
                <option :value="0">🏁 СТАРТ (+200₽ при проходе)</option>
                <option :value="20">🅿️ Бесплатная парковка (ничего)</option>
                <option :value="40">🔁 Полный круг (через СТАРТ)</option>
              </optgroup>
            </select>
          </div>
        </div>
      </div>
    </main>

    <PropertyModal
        :is-open="showModal"
        :space="selectedSpace"
        :action-required="store.pendingAction !== null"
        :my-money="store.players.find(p => p.id === myId)?.money"
        :is-property-owned="selectedSpace ? store.players.some(p => p.properties?.includes(selectedSpace?.id ?? -1)) : false"
        :owner-name="selectedSpace ? store.players.find(p => p.properties?.includes(selectedSpace?.id ?? -1))?.name : undefined"
        :is-my-property="selectedSpace ? store.players.find(p => p.id === myId)?.properties.includes(selectedSpace?.id ?? -1) : false"
        :current-house-count="selectedSpace ? store.players.find(p => p.id === myId)?.houses?.[selectedSpace?.id ?? -1] ?? 0 : 0"
        :can-buy-house="canBuyHouse"
        :can-sell-house="canSellHouse"
        @buy="handleBuyProperty"
        @pass="handlePassAction"
        @roll-for-jail="handleJailRoll"
        @pay-jail-fine="handlePayJailFine"
        @use-jail-card="handleUseJailCard"
        @buy-house="selectedSpace && handleBuyHouse(selectedSpace.id)"
        @sell-house="selectedSpace && handleSellHouse(selectedSpace.id)"
        @close="showModal = false; store.clearPendingAction()"
    />
  </div>
</template>

<style scoped>
.token { transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); }
.token:hover { transform: scale(1.2); z-index: 20; }
.scrollbar-thin::-webkit-scrollbar { width: 4px; }
.scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
.scrollbar-thin::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
</style>