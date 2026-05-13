<!-- client/src/components/GameControls.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/game'
import { useSession } from '../composables/useSession'
import { getSpaceById } from '../shared/boardConfig'
import { sendEvent, isWsReady } from '../lib/ws'

const store = useGameStore()
const { myId } = useSession()
const emit = defineEmits<{ openDetails: [] }>()

// 🔑 Безопасный ID: если myId.value пуст, берём из sessionStorage
const currentPlayerId = computed(() => myId.value || sessionStorage.getItem('monopoly_playerId') || '')

const currentPlayer = computed(() => store.players.find(p => p.id === store.currentTurn))
const isMyTurn = computed(() => !!currentPlayerId.value && store.currentTurn === currentPlayerId.value)
const isInJail = computed(() => currentPlayer.value?.isInJail || false)

const pendingActionSpace = computed(() => {
  if (!store.pendingAction || store.pendingAction === 'DOUBLE_TURN') return null
  const id = store.selectedSpaceId ?? currentPlayer.value?.pos
  return id !== undefined ? getSpaceById(id) : null
})

const showActionPanel = computed(() => {
  const action = store.pendingAction
  if (!action || action === 'NONE' || action === 'DOUBLE_TURN') return false
  if (!isMyTurn.value) return false
  if (isInJail.value && action !== 'INFO') return false
  return true
})

const paymentAmount = computed(() => {
  if (store.pendingAction === 'BUY') return pendingActionSpace.value?.price || 0
  if (store.pendingAction === 'INFO') return store.pendingInfo?.amount || 0
  return 0
})

const canAfford = computed(() => {
  const me = store.players.find(p => p.id === myId.value)
  return (me?.money || 0) >= paymentAmount.value
})

const debtAmount = computed(() => {
  const me = store.players.find(p => p.id === myId.value)
  const diff = paymentAmount.value - (me?.money || 0)
  return diff > 0 ? diff : 0
})

// 🔑 Флаг: обязательно ли действие (налог/аренда = нельзя пропустить)
const isMandatory = computed(() => store.pendingInfo?.isMandatory === true)

const actionPanelPrimaryText = computed(() => {
  const action = store.pendingAction
  if (action === 'BUY') return `Купить за ${paymentAmount.value}₽`
  if (action === 'INFO') {
    if (store.pendingInfo?.title?.includes('Бонус') || store.pendingInfo?.icon === '🎁') {
      return `Принять ${paymentAmount.value}₽`
    }
    return `Оплатить ${paymentAmount.value}₽`
  }
  if (action === 'CARD') return 'Прочитайте карту'
  return 'Продолжить'
})

const mainButtonText = computed(() => {
  if (isMyTurn.value) {
    if (isInJail.value) return '🔒 Вы в тюрьме'
    return '🎲 Бросить кубики'
  }
  return `⏳ Ждите хода: ${currentPlayer.value?.name || '...'}`
})

const rollDice = () => {
  if (!currentPlayerId.value || !isMyTurn.value) return
  sendEvent({ type: 'ROLL_DICE', playerId: currentPlayerId.value })
}

const handleMainAction = () => {
  if (pendingActionSpace.value && showActionPanel.value) {
    const action = store.pendingAction
    if (action === 'BUY') {
      sendEvent({ type: 'BUY_PROPERTY', playerId: currentPlayerId.value, spaceId: pendingActionSpace.value!.id })
    } else if (action === 'INFO' || action === 'CARD') {
      sendEvent({ type: 'PASS_ACTION', playerId: currentPlayerId.value })
    }
  } else {
    rollDice()
  }
}

const handlePassAction = () => sendEvent({ type: 'PASS_ACTION', playerId: currentPlayerId.value })
const handlePayJailFine = () => sendEvent({ type: 'PAY_JAIL_FINE', playerId: currentPlayerId.value })
const handleUseJailCard = () => sendEvent({ type: 'USE_JAIL_CARD', playerId: currentPlayerId.value })
const handleJailRoll = () => sendEvent({ type: 'ROLL_DICE', playerId: currentPlayerId.value })
</script>

<template>
  <div class="flex flex-col items-center gap-2 md:gap-3 w-full max-w-xs">

    <button
        v-if="!showActionPanel && !isInJail"
        @click="handleMainAction"
        :disabled="!isMyTurn || store.status !== 'PLAYING' || !isWsReady()"
        class="w-full px-4 md:px-5 py-2.5 md:py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed disabled:shadow-none text-white font-semibold rounded-xl transition active:scale-95 shadow-lg text-base md:text-lg flex items-center justify-center gap-2"
    >
      {{ mainButtonText }}
    </button>

    <div v-if="showActionPanel" class="w-full bg-white/90 backdrop-blur rounded-xl p-3 shadow-lg border border-gray-200 space-y-3">

      <!-- 🎨 Мини-шапка -->
      <div class="flex items-start gap-3 pb-2 border-b border-gray-100">
        <div v-if="pendingActionSpace?.color" class="w-3 h-10 rounded-full shrink-0" :class="[pendingActionSpace.color, pendingActionSpace.textColor === 'text-gray-900' ? 'border border-gray-300' : '']"></div>
        <div v-else class="w-3 h-10 rounded-full shrink-0 bg-gray-400"></div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <h4 class="font-bold text-gray-800 truncate">{{ pendingActionSpace?.name }}</h4>
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium uppercase">
              {{ pendingActionSpace?.type === 'property' ? 'Улица' : pendingActionSpace?.type === 'railroad' ? 'ЖД' : pendingActionSpace?.type === 'utility' ? '⚡' : pendingActionSpace?.type === 'tax' ? '📉' : pendingActionSpace?.type === 'chance' ? '🎲' : '📋' }}
            </span>
          </div>
          <p class="text-sm text-gray-600 mt-0.5">
            <template v-if="store.pendingAction === 'BUY'">💰 Цена: <span class="font-semibold text-green-600">{{ paymentAmount }}₽</span></template>
            <template v-else-if="store.pendingAction === 'INFO'">
              <span v-if="store.pendingInfo?.icon === '🎁'" class="font-semibold text-green-600">🎁 Бонус: {{ paymentAmount }}₽</span>
              <span v-else class="font-semibold" :class="canAfford ? 'text-red-600' : 'text-orange-600'">
                {{ store.pendingInfo?.title?.includes('Аренда') ? '💸 Аренда:' : '📉 Налог:' }} {{ paymentAmount }}₽
              </span>
            </template>
            <template v-else-if="store.pendingAction === 'CARD' && store.pendingCard"><span class="text-gray-700 leading-tight">{{ store.pendingCard.text }}</span></template>
          </p>
        </div>
      </div>

      <!-- 🔑 Кнопки действий -->
      <div class="space-y-2">

        <template v-if="store.pendingAction === 'CARD'">
          <div class="flex gap-2">
            <button @click="handleMainAction" class="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition">▶️ Далее</button>
            <button @click="emit('openDetails')" class="flex-1 px-3 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-lg transition text-sm">📋 Детали</button>
          </div>
        </template>

        <template v-else>
          <!-- Основная кнопка -->
          <button
              @click="handleMainAction"
              :disabled="store.pendingAction === 'BUY' && !canAfford"
              class="w-full px-4 py-2.5 font-semibold rounded-lg transition flex items-center justify-center gap-2"
              :class="[
              store.pendingAction === 'BUY'
                ? (canAfford ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-400 text-gray-200 cursor-not-allowed')
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            ]"
          >
            {{ actionPanelPrimaryText }}
          </button>

          <!-- Вторичные кнопки: НЕТ "Пропустить" для налогов/аренды -->
          <div class="flex gap-2" v-if="!isMandatory || store.pendingAction === 'BUY'">
            <button
                @click="handlePassAction"
                class="flex-1 px-3 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition text-sm"
            >
              {{ store.pendingAction === 'BUY' ? 'Отказаться' : 'Пропустить' }}
            </button>
            <button
                @click="emit('openDetails')"
                class="flex-1 px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-lg transition text-sm"
            >
              📋 Детали
            </button>
          </div>

          <!-- Индикатор нехватки (только для обязательных платежей) -->
          <div v-if="store.pendingAction === 'INFO' && !canAfford && isMandatory" class="text-xs text-red-600 text-center font-medium bg-red-50 px-2 py-1.5 rounded border border-red-200">
            🔴 Не хватает {{ debtAmount }}₽
            <span class="block text-[10px] text-gray-500 mt-0.5">Ход продолжится, долг сохранится</span>
          </div>

          <p v-if="store.pendingAction === 'BUY' && !canAfford" class="text-xs text-red-600 text-center font-medium bg-red-50 px-2 py-1 rounded">
            🔴 Не хватает {{ debtAmount }}₽
          </p>
        </template>
      </div>
    </div>

    <!-- 🔹 Панель тюрьмы -->
    <div v-if="isMyTurn && isInJail && !showActionPanel" class="w-full space-y-2">
      <div class="text-center text-sm font-medium text-gray-700 bg-yellow-50/80 border border-yellow-200 rounded-lg p-2">🔒 Вы находитесь в тюрьме</div>
      <button @click="handlePayJailFine" :disabled="(store.players.find(p => p.id === myId)?.money || 0) < 50" class="w-full px-3 py-2.5 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition text-sm">💸 Заплатить 50₽</button>
      <button @click="handleUseJailCard" :disabled="(store.players.find(p => p.id === myId)?.jailCards || 0) < 1" class="w-full px-3 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition text-sm">🎫 Использовать карту</button>
      <button @click="handleJailRoll" class="w-full px-3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition text-sm">🎲 Бросить на дубль ({{ (store.players.find(p => p.id === myId)?.jailTurns || 0) }}/3)</button>
    </div>
  </div>
</template>