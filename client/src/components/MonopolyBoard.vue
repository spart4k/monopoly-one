<!-- client/src/components/MonopolyBoard.vue -->
<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useGameStore } from '../stores/game'
import { useSession } from '../composables/useSession'
import { getSpaceById, type ISpaceData } from '../shared/boardConfig'
import LeftBar from './LeftBar.vue'
import PropertyModal from './PropertyModal.vue'
import { sendEvent, isWsReady } from '../lib/ws'

const store = useGameStore()
const { myId } = useSession()

const hoveredOwnerId = ref<string | null>(null)
const hoveredGroupColor = ref<string | null>(null)
const selectedSpace = ref<ISpaceData | null>(null)
const showModal = ref(false)
const debugTarget = ref<number | null>(null)
const chatContainer = ref<HTMLElement | null>(null)

// Карта: ID клетки → ID владельца
const ownerMap = computed(() => {
  const map: Record<number, string> = {}
  store.players.forEach(p => p.properties?.forEach(id => { map[id] = p.id }))
  return map
})

// 🎲 Бросок костей
const rollDice = () => {
  if (!myId.value) return
  if (store.status !== 'PLAYING') return
  if (store.currentTurn !== myId.value) return
  if (store.pendingAction && store.pendingAction !== 'DOUBLE_TURN') return

  sendEvent({
    type: 'ROLL_DICE',
    playerId: myId.value,
    targetSpaceId: debugTarget.value || undefined
  })
}

// 🏠 Покупка улицы
const handleBuyProperty = () => {
  if (!selectedSpace.value || !myId.value) return
  sendEvent({ type: 'BUY_PROPERTY', playerId: myId.value, spaceId: selectedSpace.value.id })
  showModal.value = false
  store.clearPendingAction()
}

// ⏭ Пропуск действия
const handlePassAction = () => {
  if (!myId.value) return
  console.log('📤 Client: sending PASS_ACTION')
  sendEvent({ type: 'PASS_ACTION', playerId: myId.value })

  // Закрываем модалку сразу для UX. Сервер всё равно пришлёт SYNC_STATE с новым currentTurn
  showModal.value = false
  store.clearPendingAction()
}

// 🔒 Выход из тюрьмы за 50₽
const handlePayJailFine = () => {
  if (!myId.value) return
  sendEvent({ type: 'PAY_JAIL_FINE', playerId: myId.value })
  showModal.value = false
}

// 🎫 Использование карты выхода из тюрьмы
const handleUseJailCard = () => {
  if (!myId.value) return
  sendEvent({ type: 'USE_JAIL_CARD', playerId: myId.value })
  showModal.value = false
}

// 🎲 Бросок для выхода из тюрьмы (попытка выбросить дубль)
const handleJailRoll = () => {
  if (!myId.value) return
  sendEvent({ type: 'ROLL_DICE', playerId: myId.value })
}

// ℹ️ Открытие модалки с инфо о клетке
const openSpaceInfo = (id: number) => {
  const data = getSpaceById(id)
  if (data) { selectedSpace.value = data; showModal.value = true }
}

// 🎨 Ховер по клетке для подсветки группы
const handleTileHover = (space: ISpaceData) => {
  if (space.type === 'property' && space.color) {
    hoveredGroupColor.value = space.color
  }
}
const clearTileHover = () => { hoveredGroupColor.value = null }

// 🗺 Генерация массива клеток (0-39)
const spaces = Array.from({ length: 40 }, (_, i) => getSpaceById(i)!)

// 📐 Позиция клетки в сетке 11×11
const getPos = (i: number) => {
  if (i <= 10) return { row: 11, col: 11 - i }
  if (i <= 19) return { row: 21 - i, col: 1 }
  if (i <= 30) return { row: 1, col: i - 19 }
  return { row: i - 29, col: 11 }
}

// 👤 Хелперы для отображения
const getPlayerName = (id: string) => store.players.find(p => p.id === id)?.name || '...'
const getPendingText = () => {
  switch (store.pendingAction) {
    case 'BUY': return 'Купите улицу или пропустите...'
    case 'CARD': return 'Прочитайте карту...'
    case 'INFO': return 'Подтвердите действие...'
    default: return 'Завершите действие...'
  }
}

// 🔔 Авто-открытие модалки при pendingAction (только для текущего игрока)
watch(
    () => store.pendingAction,
    (action) => {
      if (!action || store.currentTurn !== myId.value) return

      // DOUBLE_TURN не открывает модалку — просто меняем текст кнопки
      if (action === 'DOUBLE_TURN') return

      if (action === 'BUY' && store.selectedSpaceId !== null) {
        const data = getSpaceById(store.selectedSpaceId)
        if (data) { selectedSpace.value = data; showModal.value = true }
      } else if (action === 'CARD') {
        selectedSpace.value = {
          id: 7, name: '🃏 Событие', type: 'chance',
          color: 'bg-orange-200', textColor: 'text-orange-900',
          price: 0, baseRent: 0, rentWithHouse: [0,0,0,0], rentWithHotel: 0, houseCost: 0, mortgageValue: 0
        }
        showModal.value = true
      } else if (action === 'INFO') {
        selectedSpace.value = {
          id: -1, name: '', type: 'go',
          color: 'bg-gray-200', textColor: 'text-gray-800',
          price: 0, baseRent: 0, rentWithHouse: [0,0,0,0], rentWithHotel: 0, houseCost: 0, mortgageValue: 0
        }
        showModal.value = true
      }
    }
)

// 📜 Плавный скролл чата вниз при новых логах
watch(
    () => store.logs.length,
    async () => {
      await nextTick()
      if (chatContainer.value) {
        chatContainer.value.scrollTo({
          top: chatContainer.value.scrollHeight,
          behavior: 'smooth'
        })
      }
    }
)
</script>

<template>
  <div class="h-screen w-screen bg-gray-900 flex overflow-hidden">
    <LeftBar :hovered-owner-id="hoveredOwnerId" :set-hovered-owner-id="(id) => hoveredOwnerId = id" />

    <main class="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden">
      <!-- 🎯 Игровое поле 11×11 -->
      <div class="relative w-full max-w-5xl aspect-square bg-white rounded-2xl shadow-2xl overflow-hidden grid grid-cols-11 grid-rows-11 gap-1 p-2 border-4 border-gray-800">

        <!-- Клетки доски -->
        <div
            v-for="space in spaces"
            :key="space.id"
            @click="openSpaceInfo(space.id)"
            @mouseenter="handleTileHover(space)"
            @mouseleave="clearTileHover()"
            class="relative border border-gray-300/50 flex flex-col items-center justify-center text-[10px] md:text-xs font-medium select-none cursor-pointer transition-all duration-150"
            :class="[
              space.color || 'bg-gray-200',
              space.textColor,
              space.type === 'corner' ? 'font-bold bg-gray-200' : '',
              ownerMap[space.id] === hoveredOwnerId ? 'ring-2 ring-white scale-[1.03] z-10 brightness-110' : '',
              hoveredGroupColor && space.color === hoveredGroupColor && space.type === 'property'
                ? 'brightness-125 ring-1 ring-yellow-400 z-10'
                : 'hover:brightness-95'
            ]"
            :style="`grid-row: ${getPos(space.id).row}; grid-column: ${getPos(space.id).col};`"
        >
          <span class="text-center leading-tight px-0.5 break-words font-semibold">{{ space.name }}</span>

          <!-- Цена -->
          <span v-if="space.price > 0" class="text-[9px] font-mono text-gray-600 mt-0.5 bg-white/50 px-1 rounded">
            {{ space.price }}₽
          </span>

          <!-- Индикатор владельца -->
          <div v-if="ownerMap[space.id]" class="absolute top-1 right-1 w-2 h-2 rounded-full ring-1 ring-white/50"
               :class="store.players.find(p => p.id === ownerMap[space.id])?.color || 'bg-gray-500'">
          </div>

          <!-- Фишки игроков -->
          <div class="absolute bottom-1 flex gap-1">
            <div
                v-for="p in store.players.filter(pl => pl.pos === space.id)"
                :key="p.id"
                class="w-4 h-4 rounded-full shadow-md border-2 border-white token"
                :class="p.color"
                :title="p.name"
            />
          </div>
        </div>

        <!-- 🎮 Центр: управление + логи -->
        <div class="col-start-2 col-span-9 row-start-2 row-span-9 bg-gray-50 text-gray-800 flex flex-col items-center justify-center p-6 rounded-2xl gap-4">
          <!-- Кубики -->
          <div class="flex gap-4 bg-white px-6 py-3 rounded-xl shadow-md border border-gray-200">
            <div v-for="(d, i) in store.lastDice" :key="i"
                 class="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center font-bold text-3xl text-gray-800 shadow-inner">
              {{ d }}
            </div>
          </div>

          <!-- Кнопка кубиков / действия в тюрьме -->
          <template v-if="store.currentTurn === myId">
            <!-- 🎲 Обычный бросок -->
            <button
                v-if="!store.players.find(p => p.id === myId)?.isInJail"
                @click="rollDice"
                :disabled="
                  store.status !== 'PLAYING' ||
                  !myId ||
                  store.currentTurn !== myId ||
                  (store.pendingAction !== null && store.pendingAction !== 'DOUBLE_TURN') ||
                  store.players.find(p => p.id === store.currentTurn)?.isInJail ||
                  !isWsReady()
                "
                class="w-72 px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition active:scale-95 shadow-lg text-lg flex items-center justify-center gap-2"
            >
              <span v-if="store.pendingAction === 'DOUBLE_TURN' && store.currentTurn === myId">
                🎲 Бросить снова (дубль)!
              </span>
              <span v-else-if="store.pendingAction !== null">⏳ {{ getPendingText() }}</span>
              <span v-else>🎲 Бросить кубики</span>
            </button>

            <div v-else class="w-72 space-y-2">
              <button
                  @click="handlePayJailFine"
                  :disabled="(store.players.find(p => p.id === myId)?.money || 0) < 50"
                  class="w-full px-4 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-400 text-white font-semibold rounded-lg transition"
              >
                💸 Заплатить 50₽
              </button>
              <button
                  @click="handleUseJailCard"
                  :disabled="(store.players.find(p => p.id === myId)?.jailCards || 0) < 1"
                  class="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition"
              >
                🎫 Использовать карту
              </button>
              <button
                  @click="handleJailRoll"
                  class="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition"
              >
                🎲 Бросить на дубль ({{ (store.players.find(p => p.id === myId)?.jailTurns || 0) }}/3)
              </button>
            </div>
          </template>

          <span v-else class="w-72 text-center text-gray-500">
            ⏳ Ждите хода: {{ getPlayerName(store.currentTurn) }}
          </span>

          <!-- 📜 Лог событий -->
          <div ref="chatContainer" class="w-full max-w-md h-96 overflow-y-auto bg-white rounded-lg p-3 text-xs font-mono space-y-1.5 border border-gray-200 shadow-inner scrollbar-thin">
            <div v-for="(log, i) in store.logs" :key="i" class="text-gray-600 border-b border-gray-100 pb-1 last:border-0">
              {{ log }}
            </div>
          </div>

          <!-- Инфо о текущем ходе -->
          <p class="text-gray-500 text-base">
            Ход: <span class="font-semibold text-gray-800">{{ getPlayerName(store.currentTurn) }}</span>
          </p>

          <!-- 🧪 Дебаг-селект (скрыть перед релизом) -->
          <div class="w-72 mt-1">
            <label class="text-[10px] font-semibold text-gray-400 mb-0.5 block text-center">🧪 Тест-бросок:</label>
            <select v-model="debugTarget" class="w-full bg-gray-100 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option :value="null">🎲 Случайный бросок</option>
              <optgroup label="🃏 Шанс">
                <option :value="7">Клетка 7</option>
                <option :value="22">Клетка 22</option>
                <option :value="36">Клетка 36</option>
              </optgroup>
              <optgroup label="💰 Казна">
                <option :value="2">Клетка 2</option>
                <option :value="17">Клетка 17</option>
                <option :value="33">Клетка 33</option>
              </optgroup>
              <optgroup label="🏠 Улицы">
                <option :value="1">Ленинградская (60₽)</option>
                <option :value="39">Советской Армии (400₽)</option>
              </optgroup>
            </select>
          </div>
        </div>
      </div>
    </main>

    <!-- 🪟 Модалка: покупка / карта / инфо -->
    <PropertyModal
        :is-open="showModal"
        :space="selectedSpace"
        :action-required="store.pendingAction !== null"
        :my-money="store.players.find(p => p.id === myId)?.money"
        :is-property-owned="selectedSpace ? store.players.some(p => p.properties?.includes(selectedSpace?.id ?? -1)) : false"
        :owner-name="selectedSpace ? store.players.find(p => p.properties?.includes(selectedSpace?.id ?? -1))?.name : undefined"
        @buy="handleBuyProperty"
        @pass="handlePassAction"
        @rollForJail="handleJailRoll"
        @payJailFine="handlePayJailFine"
        @useJailCard="handleUseJailCard"
        @close="handlePassAction"
    />
  </div>
</template>

<style scoped>
/* 🎯 Плавная анимация фишек */
.token {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
.token:hover {
  transform: scale(1.2);
  z-index: 20;
}

/* 📜 Тонкий скроллбар для чата */
.scrollbar-thin::-webkit-scrollbar {
  width: 4px;
}
.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 2px;
}
.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>