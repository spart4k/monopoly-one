<!-- client/src/components/MonopolyBoard.vue -->
<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useGameStore } from '../stores/game'
import { useSession } from '../composables/useSession'
import { getSpaceById, type ISpaceData } from '../shared/boardConfig'
import { getPlayerColorHex } from '../shared/playerColors'
import { sendEvent, isWsReady } from '../lib/ws'

import LeftBar from './LeftBar.vue'
import PropertyModal from './PropertyModal.vue'
import TradeOverlay from './TradeOverlay.vue'
import GameControls from './GameControls.vue'

const store = useGameStore()
const { myId } = useSession()

const isTrading = computed(() => {
  const t = store.activeTrade
  return t ? (t.initiator === myId.value || t.status !== 'draft') : false
})

const isMyTurn = computed(() => {
  if (!myId.value && typeof window !== 'undefined') {
    const stored = sessionStorage.getItem('monopoly_playerId')
    if (stored) myId.value = stored
  }
  return !!myId.value && store.currentTurn === myId.value
})

const currentPlayer = computed(() => store.players.find(p => p.id === store.currentTurn))
const isInJail = computed(() => currentPlayer.value?.isInJail || false)

const hoveredOwnerId = ref<string | null>(null)
const hoveredGroupColor = ref<string | null>(null)
const selectedSpace = ref<ISpaceData | null>(null)
const showModal = ref(false)
const debugTarget = ref<number | null>(null)
const chatContainer = ref<HTMLElement | null>(null)
const boughtHouseThisTurn = ref(false)

watch(() => store.currentTurn, () => { boughtHouseThisTurn.value = false })
watch(() => store.pendingAction, (action) => { if (action === 'DOUBLE_TURN') boughtHouseThisTurn.value = false })

const visualPos = ref<Record<string, number>>({})
const animating = ref<Record<string, boolean>>({})
const animationTimeouts: NodeJS.Timeout[] = []

const ownerMap = computed(() => {
  const map: Record<number, string> = {}
  store.players.forEach(p => p.properties?.forEach(id => { map[id] = p.id }))
  return map
})

const spaces = Array.from({ length: 40 }, (_, i) => getSpaceById(i)).filter(Boolean) as ISpaceData[]

const canBuyHouse = computed(() => {
  if (!selectedSpace.value || selectedSpace.value.type !== 'property') return false
  const me = store.players.find(p => p.id === myId.value)
  if (!me || me.isInJail || me.mortgaged?.includes(selectedSpace.value.id) || me.housesBoughtThisTurn) return false

  const color = selectedSpace.value.color
  const group = Array.from({ length: 40 }, (_, i) => getSpaceById(i)).filter(s => s?.type === 'property' && s?.color === color).map(s => s.id)
  if (!group.every(id => me.properties.includes(id))) return false
  if (me.money < (selectedSpace.value.houseCost || 100)) return false

  const current = me.houses?.[selectedSpace.value.id] || 0
  if (current >= 5) return false
  const minOthers = group.filter(id => id !== selectedSpace.value.id).map(id => me.houses?.[id] || 0)
  return current <= (minOthers.length ? Math.min(...minOthers) : 0)
})

const canSellHouse = computed(() => {
  if (!selectedSpace.value || selectedSpace.value.type !== 'property') return false
  const me = store.players.find(p => p.id === myId.value)
  if (!me || !me.properties.includes(selectedSpace.value.id)) return false

  const current = me.houses?.[selectedSpace.value.id] || 0
  if (current === 0) return false
  const color = selectedSpace.value.color
  const group = Array.from({ length: 40 }, (_, i) => getSpaceById(i)).filter(s => s?.type === 'property' && s?.color === color).map(s => s.id)
  const maxOthers = group.filter(id => id !== selectedSpace.value.id).map(id => me.houses?.[id] || 0)
  return current >= (maxOthers.length ? Math.max(...maxOthers) : 0)
})

const rollDice = () => {
  if (!myId.value || !isMyTurn.value || store.status !== 'PLAYING') return
  if (store.pendingAction && store.pendingAction !== 'DOUBLE_TURN') return
  if (animating.value[myId.value]) return

  const isDebug = debugTarget.value !== null && debugTarget.value !== undefined
  sendEvent({
    type: 'ROLL_DICE',
    playerId: myId.value,
    targetSpaceId: isDebug ? debugTarget.value : undefined,
    debugTeleport: isDebug
  })
  if (isDebug) debugTarget.value = null
}

const handleBuyProperty = () => {
  if (!selectedSpace.value || !myId.value) return
  sendEvent({ type: 'BUY_PROPERTY', playerId: myId.value, spaceId: selectedSpace.value.id })
  showModal.value = false
}

const handlePassAction = () => {
  if (!myId.value) return
  sendEvent({ type: 'PASS_ACTION', playerId: myId.value })
  showModal.value = false
}

const handleBuyHouse = (spaceId: number) => {
  if (!myId.value || !canBuyHouse.value) return
  boughtHouseThisTurn.value = true
  sendEvent({ type: 'BUY_HOUSE', playerId: myId.value, spaceId })
}

const handleSellHouse = (spaceId: number) => {
  if (!myId.value || !canSellHouse.value) return
  sendEvent({ type: 'SELL_HOUSE', playerId: myId.value, spaceId })
}

const openDetailsModal = () => {
  const id = store.selectedSpaceId ?? currentPlayer.value?.pos
  if (id !== undefined) {
    const data = getSpaceById(id)
    if (data) { selectedSpace.value = data; showModal.value = true }
  }
}

const getPos = (i: number) => {
  if (i === 40) i = 0
  if (i <= 12) return { row: 1, col: i + 1 }
  if (i <= 19) return { row: i - 11, col: 13 }
  if (i <= 32) return { row: 9, col: 13 - (i - 20) }
  return { row: 41 - i, col: 1 }
}

const getPath = (from: number, to: number): number[] => {
  const path: number[] = []
  let cur = from
  while (cur !== to) { cur = (cur + 1) % 40; path.push(cur) }
  return path
}

const animateAlongPath = async (id: string, from: number, to: number) => {
  animating.value[id] = true
  for (const pos of getPath(from, to)) {
    visualPos.value[id] = pos
    await new Promise<void>(resolve => {
      const t = setTimeout(resolve, 60)
      animationTimeouts.push(t)
    })
  }
  animating.value[id] = false
}

const getTokenStyle = (id: string) => {
  const pos = visualPos.value[id] ?? 0
  const grid = getPos(pos)
  if (!grid) return {}
  const colPct = (grid.col - 1) * (100 / 13)
  const rowPct = (grid.row - 1) * (100 / 9)
  const left = colPct + (100 / 13 / 2)
  const top = rowPct + (100 / 9 / 2)
  const playersHere = store.players.filter(pl => visualPos.value[pl.id] === pos)
  const idx = playersHere.findIndex(pl => pl.id === id)
  return {
    position: 'absolute',
    left: `${left + (idx % 3 - 1) * 1.8}%`,
    top: `${top + Math.floor(idx / 3) * 1.8}%`,
    transform: 'translate(-50%, -50%)',
    transition: 'left 0.06s linear, top 0.06s linear',
    zIndex: 20 + idx
  }
}

onMounted(() => { store.players.forEach(p => visualPos.value[p.id] = p.pos) })
onBeforeUnmount(() => { animationTimeouts.forEach(clearTimeout) })

watch(
    () => store.players.map(p => ({ id: p.id, pos: p.pos })),
    (states) => {
      states.forEach(({ id, pos }) => {
        if (pos == null) return
        const currentVisual = visualPos.value[id]
        if (pos !== currentVisual && !animating.value[id]) {
          animateAlongPath(id, currentVisual, pos)
        }
      })
    }
)

watch(() => store.currentTurn, (newTurn, oldTurn) => {
  if (oldTurn && oldTurn !== newTurn) { showModal.value = false; store.clearPendingAction() }
})

watch(() => store.logs.length, async () => {
  await nextTick()
  if (chatContainer.value) chatContainer.value.scrollTo({ top: chatContainer.value.scrollHeight, behavior: 'smooth' })
})

const openSpaceInfo = (id: number) => {
  const data = getSpaceById(id)
  if (data) { selectedSpace.value = data; showModal.value = true }
}
const handleTileHover = (space: ISpaceData) => { if (space.type === 'property' && space.color) hoveredGroupColor.value = space.color }
const clearTileHover = () => { hoveredGroupColor.value = null }
const getPlayerName = (id: string) => store.players.find(p => p.id === id)?.name || '...'
</script>

<template>
  <div class="h-screen w-screen bg-gray-900 flex overflow-hidden">
    <LeftBar :hovered-owner-id="hoveredOwnerId" :set-hovered-owner-id="(id) => hoveredOwnerId = id" />

    <main class="flex-1 flex flex-col items-center justify-center p-2 md:p-4 overflow-hidden">
      <div class="relative w-full max-w-7xl aspect-[13/9] bg-white rounded-2xl shadow-2xl overflow-hidden grid grid-cols-13 grid-rows-9 gap-0.5 p-1 border-4 border-gray-800" :class="store.gameOver ? 'opacity-60 pointer-events-none' : ''">

        <div v-for="(space, i) in spaces" :key="space.id" @click="openSpaceInfo(space.id)" @mouseenter="handleTileHover(space)" @mouseleave="clearTileHover()"
             class="relative border border-gray-300/30 flex items-center justify-center text-[9px] md:text-[10px] font-medium select-none cursor-pointer transition-all duration-150 overflow-hidden aspect-square"
             :class="[
               space.color || 'bg-gray-200', space.textColor,
               [0, 10, 13, 20, 23, 30, 32].includes(i) ? 'font-bold bg-gray-200 text-[10px] md:text-xs' : '',
               ownerMap[space.id] === hoveredOwnerId ? 'ring-2 ring-white scale-[1.02] z-10 brightness-110' : '',
               hoveredGroupColor && space.color === hoveredGroupColor && space.type === 'property' ? 'brightness-125 ring-1 ring-yellow-400 z-10' : 'hover:brightness-95'
             ]"
             :style="`grid-row: ${getPos(space.id).row}; grid-column: ${getPos(space.id).col};`">

          <div class="w-full h-full flex flex-col items-center justify-center p-0.5 relative">
            <span class="text-center leading-tight font-semibold px-0.5 break-words text-[9px] md:text-[10px]">{{ space.name }}</span>
            <span v-if="space.price > 0" class="text-[7px] md:text-[8px] font-mono text-gray-600 mt-0.5 bg-white/40 px-0.5 rounded">{{ space.price }}₽</span>

            <div v-if="space.type === 'property' && ownerMap[space.id]" class="absolute top-0.5 left-0.5 flex gap-0.5 z-20">
              <template v-for="h in (store.players.find(p => p.id === ownerMap[space.id])?.houses?.[space.id] || 0)" :key="h">
                <span v-if="h < 5" class="text-[7px] md:text-[8px]">🏠</span>
                <span v-else class="text-[7px] md:text-[8px]">🏨</span>
              </template>
            </div>
            <div v-if="ownerMap[space.id]" class="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full ring-1 ring-white/50" :class="store.players.find(p => p.id === ownerMap[space.id])?.color || 'bg-gray-500'"></div>
          </div>
        </div>

        <div class="absolute inset-0 p-1 pointer-events-none">
          <div v-for="p in store.players" :key="p.id"
               class="w-4 h-4 md:w-5 md:h-5 rounded-full border-2 border-white/90 shadow-lg flex items-center justify-center text-[8px] font-bold text-white pointer-events-auto cursor-pointer hover:scale-110 transition-transform"
               :style="[getTokenStyle(p.id), { backgroundColor: getPlayerColorHex(p.color) }]"
               :title="`${p.name} (💰 ${p.money}₽)`">
            {{ p.name?.charAt(0).toUpperCase() }}
          </div>
        </div>

        <div class="col-start-2 col-span-11 row-start-2 row-span-7 rounded-2xl overflow-hidden">
          <TradeOverlay v-if="isTrading" />
          <div v-else class="w-full h-full bg-gray-50 text-gray-800 flex flex-col items-center justify-center p-4 md:p-6 gap-3 md:gap-4">
            <div class="flex gap-3 md:gap-4 bg-white px-4 md:px-6 py-2 md:py-3 rounded-xl shadow-md border border-gray-200">
              <div v-for="(d, i) in store.lastDice" :key="i" class="w-12 h-12 md:w-14 md:h-14 bg-gray-100 rounded-xl flex items-center justify-center font-bold text-2xl md:text-3xl text-gray-800 shadow-inner">{{ d }}</div>
            </div>

            <!-- 🔹 Передаём debugTarget в GameControls -->
            <GameControls :debug-target="debugTarget" v-if="!store.gameOver" @open-details="openDetailsModal" />

            <div ref="chatContainer" class="w-full max-w-md h-48 md:h-96 overflow-y-auto bg-white rounded-lg p-2 md:p-3 text-[10px] md:text-xs font-mono space-y-1 border border-gray-200 shadow-inner custom-scroll">
              <div v-for="(log, i) in store.logs" :key="i" class="text-gray-600 border-b border-gray-100 pb-1 last:border-0">{{ log }}</div>
            </div>

            <p class="text-gray-500 text-sm md:text-base">
              Ход: <span class="font-semibold text-gray-800">{{ getPlayerName(store.currentTurn) }}</span>
              <span v-if="store.gameOver" class="ml-2 px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-bold">ИГРА ОКОНЧЕНА</span>
            </p>

            <div class="w-full max-w-xs mt-1">
              <label class="text-[9px] md:text-[10px] font-semibold text-gray-400 mb-0.5 block text-center">🧪 Все ячейки (0-39):</label>
              <select v-model="debugTarget" class="w-full bg-gray-100 border border-gray-300 rounded-lg px-2 py-1 text-[10px] md:text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 max-h-48 overflow-y-auto">
                <option :value="null">🎲 Случайный бросок</option>
                <optgroup label="🏁 Угловые"><option :value="0">0️⃣ СТАРТ</option><option :value="10">🔒 ТЮРЬМА</option><option :value="20">🚗 БЕСПЛАТНАЯ СТОЯНКА</option><option :value="30">🚔 ИДИ В ТЮРЬМУ</option></optgroup>
                <optgroup label="🟤 Коричневые"><option :value="1">1️⃣ Ленинградская</option><option :value="3">3️⃣ Вилоновская</option></optgroup>
                <optgroup label="💧 Голубые"><option :value="6">6️⃣ пр. Кирова</option><option :value="8">8️⃣ ул. Куйбышева</option><option :value="9">9️⃣ Мичурина</option></optgroup>
                <optgroup label="🌸 Розовые"><option :value="11">1️⃣1️⃣ Галактионовская</option><option :value="13">1️⃣3️⃣ Купеческая</option><option :value="14">1️⃣4️⃣ Некрасовская</option></optgroup>
                <optgroup label="🟠 Оранжевые"><option :value="16">1️⃣6️⃣ ул. Полевая</option><option :value="18">1️⃣8️⃣ Братьев Коростылевых</option><option :value="19">1️⃣9️⃣ Красноармейская</option></optgroup>
                <optgroup label="🔴 Красные"><option :value="21">2️⃣1️⃣ ул. Осипенко</option><option :value="23">2️⃣3️⃣ ул. Садовая</option><option :value="24">2️⃣4️⃣ Аэродромная</option></optgroup>
                <optgroup label="🟡 Жёлтые"><option :value="26">2️⃣6️⃣ пр. Ленина</option><option :value="27">2️⃣7️⃣ ул. Спортивная</option><option :value="29">2️⃣9️⃣ Арцыбушевская</option></optgroup>
                <optgroup label="🟢 Зелёные"><option :value="31">3️⃣1️⃣ ул. Ново-Садовая</option><option :value="32">3️⃣2️⃣ ул. Стара-Загора</option><option :value="34">3️⃣4️⃣ ул. Мичурина</option></optgroup>
                <optgroup label="🔵 Синие"><option :value="37">3️⃣7️⃣ ул. Фрунзе</option><option :value="39">3️⃣9️⃣ ул. Советской Армии</option></optgroup>
                <optgroup label="🚂 Транспорт"><option :value="5">5️⃣ ЖД Вокзал</option><option :value="15">1️⃣5️⃣ Речной Вокзал</option><option :value="25">2️⃣5️⃣ Автовокзал</option><option :value="35">3️⃣5️⃣ Аэропорт Курумоч</option></optgroup>
                <optgroup label="⚡ Коммуналки"><option :value="12">1️⃣2️⃣ Водоканал</option><option :value="28">2️⃣8️⃣ Электросети</option></optgroup>
                <optgroup label="🃏 Карты"><option :value="2">2️⃣ Казна</option><option :value="7">7️⃣ Шанс</option><option :value="17">1️⃣7️⃣ Казна</option><option :value="22">2️⃣2️⃣ Шанс</option><option :value="33">3️⃣3️⃣ Казна</option><option :value="36">3️⃣6️⃣ Шанс</option></optgroup>
                <optgroup label="📉 Налоги"><option :value="4">4️⃣ Подоходный налог</option><option :value="38">3️⃣8️⃣ Налог на роскошь</option></optgroup>
              </select>
            </div>
          </div>
        </div>
      </div>
    </main>

    <PropertyModal
        :is-open="showModal"
        :space="selectedSpace"
        :action-required="store.pendingAction !== null"
        :required-amount="store.pendingAction === 'BUY' ? selectedSpace?.price : (store.pendingInfo?.amount || 0)"
        :my-money="store.players.find(p => p.id === myId)?.money"
        :is-property-owned="selectedSpace ? store.players.some(p => p.properties?.includes(selectedSpace?.id ?? -1)) : false"
        :owner-name="selectedSpace ? store.players.find(p => p.properties?.includes(selectedSpace?.id ?? -1))?.name : undefined"
        :is-my-property="selectedSpace ? store.players.find(p => p.id === myId)?.properties.includes(selectedSpace?.id ?? -1) : false"
        :current-house-count="selectedSpace ? store.players.find(p => p.id === myId)?.houses?.[selectedSpace?.id ?? -1] ?? 0 : 0"
        :can-buy-house="canBuyHouse"
        :can-sell-house="canSellHouse"
        @buy="handleBuyProperty"
        @pass="handlePassAction"
        @buy-house="selectedSpace && sendEvent({ type: 'BUY_HOUSE', playerId: myId, spaceId: selectedSpace.id })"
        @sell-house="selectedSpace && sendEvent({ type: 'SELL_HOUSE', playerId: myId, spaceId: selectedSpace.id })"
        @mortgage="selectedSpace && sendEvent({ type: 'MORTGAGE_PROPERTY', playerId: myId, spaceId: selectedSpace.id })"
        @unmortgage="selectedSpace && sendEvent({ type: 'UNMORTGAGE_PROPERTY', playerId: myId, spaceId: selectedSpace.id })"
        @bankrupt="selectedSpace && sendEvent({ type: 'BANKRUPTCY', playerId: myId, spaceId: selectedSpace.id })"
        @close="showModal = false"
    />
  </div>
</template>

<style scoped>
.scrollbar-thin::-webkit-scrollbar { width: 4px; }
.scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
.scrollbar-thin::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
</style>