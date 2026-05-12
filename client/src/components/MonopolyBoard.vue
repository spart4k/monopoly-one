<!-- client/src/components/MonopolyBoard.vue -->
<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useGameStore } from '../stores/game'
import { useSession } from '../composables/useSession'
import { getSpaceById } from '../shared/boardConfig'
import type { ISpaceData } from '../shared/boardConfig'
import { getPlayerColorHex } from '../shared/playerColors'
import LeftBar from './LeftBar.vue'
import PropertyModal from './PropertyModal.vue'
import TradeOverlay from './TradeOverlay.vue'
import { sendEvent, isWsReady } from '../lib/ws'

const store = useGameStore()
const { myId } = useSession()

const isTrading = computed(() => {
  const t = store.activeTrade
  if (!t) return false
  // ✅ Показываем панель обмена:
  // 1. Если я инициатор (вижу свой черновик)
  // 2. Если обмен уже отправлен (proposed) -> виден обоим
  return t.initiator === myId.value || t.status !== 'draft'
})

const isMyTurn = computed(() => {
  // 🔑 Форс-восстановление myId из sessionStorage, если ref ещё пуст
  if (!myId.value && typeof window !== 'undefined') {
    const stored = sessionStorage.getItem('monopoly_playerId')
    if (stored) {
      console.log('🔄 [BOARD] Restoring myId from sessionStorage:', stored)
      myId.value = stored
    }
  }

  if (!myId.value || !store.currentTurn) return false
  return store.currentTurn === myId.value
})

const currentPlayer = computed(() => store.players.find(p => p.id === store.currentTurn))
const isInJail = computed(() => currentPlayer.value?.isInJail || false)

const hoveredOwnerId = ref<string | null>(null)
const hoveredGroupColor = ref<string | null>(null)
const selectedSpace = ref<ISpaceData | null>(null)
const showModal = ref(false)

// При смене хода закрываем модалку и чистим локальный UI-стейт
watch(() => store.currentTurn, (newTurn, oldTurn) => {
  if (oldTurn && oldTurn !== newTurn) {
    showModal.value = false
    store.clearPendingAction()
  }
})

watch([() => store.currentTurn, () => myId.value], ([turn, id]) => {
  console.log(`🔄 [BOARD] currentTurn: ${turn}, myId: ${id}, isMyTurn: ${turn === id}`)
}, { immediate: true })

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
  if (!me || me.isInJail) return false

  // 🔑 БЛОКИРОВКА: нельзя строить на заложенной улице
  if (me.mortgaged?.includes(selectedSpace.value.id)) return false

  // 🔑 БЛОКИРОВКА: лимит 1 дом за ход
  if (me.housesBoughtThisTurn) return false

  const color = selectedSpace.value.color
  const group = Array.from({ length: 40 }, (_, i) => getSpaceById(i))
      .filter(s => s?.type === 'property' && s?.color === color)
      .map(s => s.id)

  if (!group.every(id => me.properties.includes(id))) return false
  if (me.money < (selectedSpace.value.houseCost || 100)) return false

  const current = me.houses?.[selectedSpace.value.id] || 0
  if (current >= 5) return false

  const others = group.filter(id => id !== selectedSpace.value.id).map(id => me.houses?.[id] || 0)
  const minOthers = others.length ? Math.min(...others) : 0
  return current <= minOthers
})

const canSellHouse = computed(() => {
  if (!selectedSpace.value || selectedSpace.value.type !== 'property') return false
  const me = store.players.find(p => p.id === myId.value)
  if (!me || !me.properties.includes(selectedSpace.value.id)) return false

  const current = me.houses?.[selectedSpace.value.id] || 0
  if (current === 0) return false

  const color = selectedSpace.value.color
  const group = Array.from({ length: 40 }, (_, i) => getSpaceById(i))
      .filter(s => s?.type === 'property' && s?.color === color)
      .map(s => s.id)

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

// 🔑 Позиции для сетки 12 колонок × 8 рядов
// Визуальные углы: 0, 10, 13, 20, 23, 30, 32
// 🔑 Позиции для сетки 13 колонок × 9 рядов
// Визуальные углы: 0, 10, 13, 20, 23, 30, 32
// 🔑 Позиции для сетки 13×9 со СТРОГО последовательным порядком 0→39
// Круг по периметру: верх(→) → право(↓) → низ(←) → лево(↑)
// 🔑 Позиции для сетки 13×9 (строго 0→39 по периметру)
const getPos = (i: number) => {
  if (i === 40) i = 0

  // Верх: 0-12 (ряд 1, слева→направо)
  if (i <= 12) return { row: 1, col: i + 1 }

  // Право: 13-19 (колонка 13, сверху→вниз)
  if (i <= 19) return { row: i - 11, col: 13 }

  // Низ: 20-32 (ряд 9, справа→налево)
  if (i <= 32) return { row: 9, col: 13 - (i - 20) }

  // Лево: 33-39 (колонка 1, снизу→вверх)
  return { row: 41 - i, col: 1 }
}

// 🔑 Плавная анимация фишек
const visualPos = ref<Record<string, number>>({})
const animating = ref<Record<string, boolean>>({})
const animationTimeouts: NodeJS.Timeout[] = []

// Инициализация при монтировании
onMounted(() => {
  store.players.forEach(p => visualPos.value[p.id] = p.pos)
})

// Очистка таймеров при уходе со страницы
onBeforeUnmount(() => animationTimeouts.forEach(clearTimeout))

// 🎯 Слежение ТОЛЬКО за изменениями позиций
watch(
    () => store.players.map(p => ({ id: p.id, pos: p.pos })),
    (states) => {
      states.forEach(({ id, pos }) => {
        if (pos === undefined || pos === null) return
        const currentVisual = visualPos.value[id]
        // Запускаем анимацию только если целевая позиция отличается от текущей визуальной
        if (pos !== currentVisual && !animating.value[id]) {
          animateAlongPath(id, currentVisual, pos)
        }
      })
    }
)

// 🛤 Вычисление пути по периметру (по часовой стрелке, 0→39)
const getPath = (from: number, to: number): number[] => {
  const path = []
  let cur = from
  while (cur !== to) {
    cur = (cur + 1) % 40
    path.push(cur)
  }
  return path
}

// 🎬 Пошаговая анимация
const animateAlongPath = async (id: string, from: number, to: number) => {
  animating.value[id] = true
  const path = getPath(from, to)
  const stepDuration = 60 // мс на клетку (можно уменьшить для ускорения)

  for (const pos of path) {
    visualPos.value[id] = pos
    await new Promise<void>(resolve => {
      const t = setTimeout(resolve, stepDuration)
      animationTimeouts.push(t)
    })
  }
  animating.value[id] = false
}

// 🎨 Стили для фишки (берут визуальную позицию)
const getTokenStyle = (id: string) => {
  const pos = visualPos.value[id] ?? 0
  const grid = getPos(pos)
  if (!grid) return {}

  // Базовый центр клетки в %
  const colPct = (grid.col - 1) * (100 / 13)
  const rowPct = (grid.row - 1) * (100 / 9)
  const left = colPct + (100 / 13 / 2)
  const top = rowPct + (100 / 9 / 2)

  // Смещение при наложении нескольких фишек на одну клетку
  const playersHere = store.players.filter(pl => visualPos.value[pl.id] === pos)
  const idx = playersHere.findIndex(pl => pl.id === id)
  const offX = (idx % 3 - 1) * 1.8
  const offY = Math.floor(idx / 3) * 1.8

  return {
    position: 'absolute',
    left: `${left + offX}%`,
    top: `${top + offY}%`,
    transform: 'translate(-50%, -50%)',
    // ⚡ CSS-transition синхронизирован с stepDuration
    transition: `left 0.06s linear, top 0.06s linear`,
    zIndex: 20 + idx
  }
}

const rollDice = () => {
  if (!myId.value || !isMyTurn.value) return
  if (store.status !== 'PLAYING') return
  if (store.pendingAction && store.pendingAction !== 'DOUBLE_TURN') return
  if (animating.value[myId.value]) return // 🔒 Игрок не может кинуть, пока фишка летит
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

const actionQueue = ref<{ type: string; spaceId?: number } | null>(null)

// Замени старый watch(() => store.pendingAction...) на этот блок:
watch([() => store.pendingAction, () => store.selectedSpaceId], ([action, spaceId]) => {
  if (!action || action === 'DOUBLE_TURN' || !isMyTurn.value) return

  // Если фишка ещё движется → откладываем открытие модалки
  if (animating.value[myId.value]) {
    actionQueue.value = { type: action, spaceId: spaceId ?? undefined }
    return
  }
  openModalByAction(action, spaceId)
})

// Срабатывает ровно в момент завершения анимации
watch(() => animating.value[myId.value], (isAnimating) => {
  if (!isAnimating && actionQueue.value) {
    openModalByAction(actionQueue.value.type, actionQueue.value.spaceId)
    actionQueue.value = null
  }
})

function openModalByAction(action: string, spaceId?: number) {
  if (action === 'BUY' && spaceId != null) {
    const data = getSpaceById(spaceId)
    if (data) { selectedSpace.value = data; showModal.value = true }
  } else if (action === 'CARD') {
    store.selectedSpaceId = 7 // 🔑 КРИТИЧНО: синхронизируем ID с isActionTarget
    selectedSpace.value = { id: 7, name: '🃏 Событие', type: 'chance', color: 'bg-orange-200', textColor: 'text-orange-900', price: 0, baseRent: 0, rentWithHouse: [0,0,0,0], rentWithHotel: 0, houseCost: 0, mortgageValue: 0 }
    showModal.value = true
  } else if (action === 'INFO') {
    // 🔑 Берём ID из стора (гарантированно актуален), fallback на позицию игрока
    const targetId = store.selectedSpaceId ?? currentPlayer.value?.pos
    const data = getSpaceById(targetId)
    if (data) selectedSpace.value = data
    showModal.value = true
  }
}

watch(() => store.logs.length, async () => {
  await nextTick()
  if (chatContainer.value) chatContainer.value.scrollTo({ top: chatContainer.value.scrollHeight, behavior: 'smooth' })
})
</script>

<template>
  <div class="h-screen w-screen bg-gray-900 flex overflow-hidden">
    <LeftBar :hovered-owner-id="hoveredOwnerId" :set-hovered-owner-id="(id) => hoveredOwnerId = id" />

    <main class="flex-1 flex flex-col items-center justify-center p-2 md:p-4 overflow-hidden">
      <!-- 🔑 Сетка 13×9: больше ширины и высоты, квадратные клетки -->
      <!-- Сетка 13×9, квадратные клетки, горизонтальный текст везде -->
      <!-- 🔑 Сетка 13×9, квадратные клетки, точное размещение -->
      <div class="relative w-full max-w-7xl aspect-[13/9] bg-white rounded-2xl shadow-2xl overflow-hidden grid grid-cols-13 grid-rows-9 gap-0.5 p-1 border-4 border-gray-800">

        <!-- Клетки доски -->
        <!-- Клетки доски -->
        <div v-for="(space, i) in spaces" :key="space.id" @click="openSpaceInfo(space.id)" @mouseenter="handleTileHover(space)" @mouseleave="clearTileHover()"
             class="relative border border-gray-300/30 flex items-center justify-center text-[9px] md:text-[10px] font-medium select-none cursor-pointer transition-all duration-150 overflow-hidden aspect-square"
             :class="[
               space.color || 'bg-gray-200',
               space.textColor,
               // 🔷 Визуальные углы: чуть крупнее шрифт
               [0, 10, 13, 20, 23, 30, 32].includes(i) ? 'font-bold bg-gray-200 text-[10px] md:text-xs' : '',
               // 🔍 Подсветка
               ownerMap[space.id] === hoveredOwnerId ? 'ring-2 ring-white scale-[1.02] z-10 brightness-110' : '',
               hoveredGroupColor && space.color === hoveredGroupColor && space.type === 'property' ? 'brightness-125 ring-1 ring-yellow-400 z-10' : 'hover:brightness-95'
             ]"
             :style="`grid-row: ${getPos(space.id).row}; grid-column: ${getPos(space.id).col};`">

          <div class="w-full h-full flex flex-col items-center justify-center p-0.5 relative">
            <!-- 🔼 ВСЕ названия горизонтально (больше места благодаря сетке 13×9) -->
            <span class="text-center leading-tight font-semibold px-0.5 break-words text-[9px] md:text-[10px]">{{ space.name }}</span>
            <span v-if="space.price > 0" class="text-[7px] md:text-[8px] font-mono text-gray-600 mt-0.5 bg-white/40 px-0.5 rounded">{{ space.price }}₽</span>

            <!-- Индикаторы домов -->
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
        <!-- 🔑 Центр доски: занимает col 2-11, row 2-7 (при сетке 12×8) -->
        <!-- 🔑 Центр доски: заменяется на панель обмена, если участвуем в сделке -->
        <div class="col-start-2 col-span-11 row-start-2 row-span-7 rounded-2xl overflow-hidden">

          <TradeOverlay v-if="isTrading" />

          <div v-else class="w-full h-full bg-gray-50 text-gray-800 flex flex-col items-center justify-center p-4 md:p-6 gap-3 md:gap-4">
            <!-- Кубики -->
            <div class="flex gap-3 md:gap-4 bg-white px-4 md:px-6 py-2 md:py-3 rounded-xl shadow-md border border-gray-200">
              <div v-for="(d, i) in store.lastDice" :key="i" class="w-12 h-12 md:w-14 md:h-14 bg-gray-100 rounded-xl flex items-center justify-center font-bold text-2xl md:text-3xl text-gray-800 shadow-inner">{{ d }}</div>
            </div>

            <!-- Кнопки управления -->
            <div class="flex flex-col items-center gap-2 md:gap-3 w-full max-w-xs">
              <!-- 🔑 Динамическая кнопка: Бросить / Продолжить действие -->
              <button
                  @click="store.pendingAction && store.pendingAction !== 'DOUBLE_TURN' ? (showModal = true) : rollDice()"
                  :disabled="store.status !== 'PLAYING' || !isMyTurn || !isWsReady() || (isInJail && !store.pendingAction)"
                  class="w-full px-4 md:px-5 py-2.5 md:py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition active:scale-95 shadow-lg text-base md:text-lg flex items-center justify-center gap-2"
              >
                <span v-if="store.pendingAction && store.pendingAction !== 'DOUBLE_TURN'">
                  📋 {{ getPendingText() }}
                </span>
                <span v-else-if="isInJail && !store.pendingAction">🔒 Вы в тюрьме</span>
                <span v-else-if="isMyTurn">🎲 Бросить кубики</span>
                <span v-else>⏳ Ждите хода: {{ getPlayerName(store.currentTurn) }}</span>
              </button>

              <div v-if="isInJail && isMyTurn && !store.pendingAction" class="flex flex-col gap-1.5 w-full">
                <button @click="handlePayJailFine" :disabled="(store.players.find(p => p.id === myId)?.money || 0) < 50" class="w-full px-3 py-1.5 md:px-4 md:py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition text-xs md:text-sm">💸 Заплатить 50₽</button>
                <button @click="handleUseJailCard" :disabled="(store.players.find(p => p.id === myId)?.jailCards || 0) < 1" class="w-full px-3 py-1.5 md:px-4 md:py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition text-xs md:text-sm">🎫 Использовать карту</button>
                <button @click="handleJailRoll" class="w-full px-3 py-1.5 md:px-4 md:py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition text-xs md:text-sm">🎲 Бросить на дубль ({{ (store.players.find(p => p.id === myId)?.jailTurns || 0) }}/3)</button>
              </div>
            </div>

            <!-- Лог событий -->
            <div ref="chatContainer" class="w-full max-w-md h-48 md:h-96 overflow-y-auto bg-white rounded-lg p-2 md:p-3 text-[10px] md:text-xs font-mono space-y-1 border border-gray-200 shadow-inner custom-scroll">
              <div v-for="(log, i) in store.logs" :key="i" class="text-gray-600 border-b border-gray-100 pb-1 last:border-0">{{ log }}</div>
            </div>

            <!-- Инфо о ходе -->
            <p class="text-gray-500 text-sm md:text-base">Ход: <span class="font-semibold text-gray-800">{{ getPlayerName(store.currentTurn) }}</span></p>

            <!-- 🧪 Дебаг-селект -->
            <!-- 🧪 Тестовые сценарии (ВСЕ 40 ячеек по boardConfig) -->
            <div class="w-full max-w-xs mt-1">
              <label class="text-[9px] md:text-[10px] font-semibold text-gray-400 mb-0.5 block text-center">🧪 Все ячейки (0-39):</label>
              <select v-model="debugTarget" class="w-full bg-gray-100 border border-gray-300 rounded-lg px-2 py-1 text-[10px] md:text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 max-h-48 overflow-y-auto">
                <option :value="null">🎲 Случайный бросок</option>

                <optgroup label="🏁 Угловые">
                  <option :value="0">0️⃣ СТАРТ</option>
                  <option :value="10">🔒 ТЮРЬМА</option>
                  <option :value="20">🚗 БЕСПЛАТНАЯ СТОЯНКА</option>
                  <option :value="30">🚔 ИДИ В ТЮРЬМУ</option>
                </optgroup>

                <optgroup label="🟤 Коричневые (1, 3)">
                  <option :value="1">1️⃣ Ленинградская</option>
                  <option :value="3">3️⃣ Вилоновская</option>
                </optgroup>

                <optgroup label="💧 Голубые (6, 8, 9)">
                  <option :value="6">6️⃣ пр. Кирова</option>
                  <option :value="8">8️⃣ ул. Куйбышева</option>
                  <option :value="9">9️⃣ Мичурина</option>
                </optgroup>

                <optgroup label="🌸 Розовые (11, 13, 14)">
                  <option :value="11">1️⃣1️⃣ Галактионовская</option>
                  <option :value="13">1️⃣3️⃣ Купеческая</option>
                  <option :value="14">1️⃣4️⃣ Некрасовская</option>
                </optgroup>

                <optgroup label="🟠 Оранжевые (16, 18, 19)">
                  <option :value="16">1️⃣6️⃣ ул. Полевая</option>
                  <option :value="18">1️⃣8️⃣ Братьев Коростылевых</option>
                  <option :value="19">1️⃣9️⃣ Красноармейская</option>
                </optgroup>

                <optgroup label="🔴 Красные (21, 23, 24)">
                  <option :value="21">2️⃣1️⃣ ул. Осипенко</option>
                  <option :value="23">2️⃣3️⃣ ул. Садовая</option>
                  <option :value="24">2️⃣4️⃣ Аэродромная</option>
                </optgroup>

                <optgroup label="🟡 Жёлтые (26, 27, 29)">
                  <option :value="26">2️⃣6️⃣ пр. Ленина</option>
                  <option :value="27">2️⃣7️⃣ ул. Спортивная</option>
                  <option :value="29">2️⃣9️⃣ Арцыбушевская</option>
                </optgroup>

                <optgroup label="🟢 Зелёные (31, 32, 34)">
                  <option :value="31">3️⃣1️⃣ ул. Ново-Садовая</option>
                  <option :value="32">3️⃣2️⃣ ул. Стара-Загора</option>
                  <option :value="34">3️⃣4️⃣ ул. Мичурина</option>
                </optgroup>

                <optgroup label="🔵 Синие (37, 39)">
                  <option :value="37">3️⃣7️⃣ ул. Фрунзе</option>
                  <option :value="39">3️⃣9️⃣ ул. Советской Армии</option>
                </optgroup>

                <optgroup label="🚂 Транспорт">
                  <option :value="5">5️⃣ ЖД Вокзал</option>
                  <option :value="15">1️⃣5️⃣ Речной Вокзал</option>
                  <option :value="25">2️⃣5️⃣ Автовокзал</option>
                  <option :value="35">3️⃣5️⃣ Аэропорт Курумоч</option>
                </optgroup>

                <optgroup label="⚡ Коммуналки">
                  <option :value="12">1️⃣2️⃣ Водоканал</option>
                  <option :value="28">2️⃣8️⃣ Электросети</option>
                </optgroup>

                <optgroup label="🃏 Карты">
                  <option :value="2">2️⃣ Казна</option>
                  <option :value="7">7️⃣ Шанс</option>
                  <option :value="17">1️⃣7️⃣ Казна</option>
                  <option :value="22">2️⃣2️⃣ Шанс</option>
                  <option :value="33">3️⃣3️⃣ Казна</option>
                  <option :value="36">3️⃣6️⃣ Шанс</option>
                </optgroup>

                <optgroup label="📉 Налоги">
                  <option :value="4">4️⃣ Подоходный налог</option>
                  <option :value="38">3️⃣8️⃣ Налог на роскошь</option>
                </optgroup>
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
.token { transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); }
.token:hover { transform: scale(1.2); z-index: 20; }
.scrollbar-thin::-webkit-scrollbar { width: 4px; }
.scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
.scrollbar-thin::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
</style>