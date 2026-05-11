<!-- client/src/components/PropertyModal.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/game'
import type { ISpaceData } from '../../shared/boardConfig'

const store = useGameStore()

const props = defineProps<{
  isOpen: boolean
  space: ISpaceData | null
  actionRequired?: boolean
  myMoney?: number
  isPropertyOwned?: boolean
  ownerName?: string
  isMyProperty?: boolean
  currentHouseCount?: number
  canBuyHouse?: boolean
  canSellHouse?: boolean
}>()

const emit = defineEmits<{
  close: []
  buy: []
  pass: []
  buyHouse: []
  sellHouse: []
  rollForJail: []
  payJailFine: []
  useJailCard: []
}>()

const isProperty = computed(() => props.space?.type === 'property' || props.space?.type === 'railroad')
const canAfford = computed(() => props.myMoney !== undefined && props.space?.price !== undefined && props.myMoney >= props.space.price)
const currentPlayer = computed(() => store.players.find(p => p.id === store.currentTurn))
const houseLabels = ['1 дом', '2 дома', '3 дома', '4 дома']

// 🔑 Динамический маппинг кнопок для карт
const cardButton = computed(() => {
  const card = store.pendingCard
  if (!card) return { text: 'Продолжить', color: 'bg-blue-600 hover:bg-blue-700' }
  switch (card.action) {
    case 'pay': return { text: 'Заплатить', color: 'bg-red-500 hover:bg-red-600' }
    case 'receive': case 'move_to_start': return { text: 'Получить', color: 'bg-green-500 hover:bg-green-600' }
    case 'move': return { text: 'Перейти', color: 'bg-blue-500 hover:bg-blue-600' }
    case 'go_to_jail': return { text: 'Отправиться', color: 'bg-gray-600 hover:bg-gray-700' }
    case 'get_card': return { text: 'Взять карту', color: 'bg-purple-500 hover:bg-purple-600' }
    default: return { text: 'Продолжить', color: 'bg-blue-500 hover:bg-blue-700' }
  }
})

</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="isOpen && space" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" @click.self="emit('close')">
        <div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden flex flex-col max-h-[90vh]">
          <!-- Шапка -->
          <div class="p-4 text-white relative shrink-0" :class="[space.color || 'bg-gray-500', space.textColor === 'text-gray-900' ? 'text-gray-900' : 'text-white']">
            <button @click="emit('close')" class="absolute top-3 right-3 opacity-70 hover:opacity-100 transition text-xl leading-none">✕</button>
            <h3 class="text-xl font-bold">{{ space.name }}</h3>
            <span class="text-xs opacity-80 uppercase tracking-wider">{{ space.type }}</span>
          </div>

          <!-- Тело -->
          <div class="p-4 space-y-4 text-gray-700 overflow-y-auto">
            <!-- 🃏 Карта -->
            <div v-if="store.pendingAction === 'CARD'" class="text-center py-6 space-y-4 bg-orange-50 rounded-lg border border-orange-200">
              <div class="text-6xl">🃏</div>
              <p class="text-lg font-medium text-gray-800 leading-snug min-h-[3.5rem] flex items-center justify-center px-2">
                {{ store.pendingCard?.text || 'Загрузка карты...' }}
              </p>
            </div>

            <!-- ℹ️ Инфо/Тюрьма -->
            <div v-else-if="store.pendingAction === 'INFO'" class="text-center py-6 space-y-4">
              <div v-if="currentPlayer?.isInJail" class="text-5xl">🔒</div>
              <div v-else class="text-6xl">{{ store.pendingInfo?.icon || 'ℹ️' }}</div>
              <h3 class="text-2xl font-bold text-gray-800">{{ currentPlayer?.isInJail ? 'Вы в тюрьме' : store.pendingInfo?.title }}</h3>
              <p class="text-gray-600 text-lg leading-relaxed">{{ currentPlayer?.isInJail ? `Попыток осталось: ${currentPlayer.jailTurns}/3` : store.pendingInfo?.message }}</p>
            </div>

            <!-- 🏠 Недвижимость -->
            <div v-else-if="isProperty" class="space-y-4">
              <div v-if="isPropertyOwned" class="p-3 rounded-lg border" :class="isMyProperty ? 'bg-green-50 border-green-200 text-green-700' : 'bg-blue-50 border-blue-200 text-blue-700'">
                <div class="flex items-center gap-2 font-semibold"><span>{{ isMyProperty ? '✅' : '🔑' }}</span><span>{{ isMyProperty ? 'Ваша собственность' : `Владелец: ${ownerName || 'Игрок'}` }}</span></div>
                <div v-if="isMyProperty && currentHouseCount !== undefined" class="text-sm mt-1 pl-6">Зданий: {{ currentHouseCount === 0 ? 'Нет' : currentHouseCount === 5 ? '🏨 Отель' : `🏠 ${currentHouseCount}/4` }}</div>
              </div>
              <div v-else-if="actionRequired && space.price > 0" class="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                <div class="flex justify-between items-center"><span class="font-semibold">Купить за:</span><span class="text-2xl font-bold text-green-600">{{ space.price }}₽</span></div>
                <div class="text-sm text-gray-500">На балансе: <span :class="canAfford ? 'text-green-600 font-semibold' : 'text-red-500'">{{ myMoney }}₽</span></div>
              </div>
              <div class="border-t pt-3">
                <h4 class="font-semibold mb-2">Аренда:</h4>
                <table class="w-full text-sm">
                  <tr class="border-b" :class="{ 'bg-green-50 font-semibold text-green-700': currentHouseCount === 0 }"><td class="py-1"><span v-if="currentHouseCount === 0">✅ </span>Базовая</td><td class="text-right font-mono">{{ space.baseRent }}₽</td></tr>
                  <tr v-if="space.rentWithHouse" v-for="(rent, i) in space.rentWithHouse" :key="i" class="border-b" :class="{ 'bg-green-50 font-semibold text-green-700': currentHouseCount === i + 1 }"><td class="py-1"><span v-if="currentHouseCount === i + 1">✅ </span>{{ houseLabels[i] }}</td><td class="text-right font-mono">{{ rent }}₽</td></tr>
                  <tr v-if="space.rentWithHotel" class="font-bold text-blue-600" :class="{ 'bg-blue-50 font-semibold text-blue-700': currentHouseCount === 5 }"><td class="py-2"><span v-if="currentHouseCount === 5">✅ </span>С отелем</td><td class="text-right font-mono">{{ space.rentWithHotel }}₽</td></tr>
                </table>
              </div>
              <div v-if="isMyProperty && space.type === 'property'" class="pt-2 border-t space-y-2">
                <div class="flex justify-between text-sm text-gray-500"><span>Стоимость дома</span><span class="font-mono">{{ space.houseCost }}₽</span></div>
                <div class="flex gap-2">
                  <button @click="emit('buyHouse')" :disabled="!canBuyHouse" class="flex-1 px-2 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-xs rounded-lg transition">🏠 Купить</button>
                  <button @click="emit('sellHouse')" :disabled="!canSellHouse" class="flex-1 px-2 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-xs rounded-lg transition">💰 Продать</button>
                </div>
              </div>
            </div>

            <!-- ℹ️ Прочие -->
            <div v-else class="text-center py-4 text-gray-500">
              <span v-if="space.type === 'tax'">📉 Заплатите налог</span>
              <span v-else>ℹ️ Информационное поле</span>
            </div>
          </div>

          <!-- 🔻 Футер -->
          <div class="p-4 bg-gray-50 flex flex-col gap-2 border-t shrink-0">
            <!-- Тюрьма -->
            <div v-if="currentPlayer?.isInJail && store.pendingAction === 'INFO'" class="flex gap-2">
              <button @click="emit('rollForJail')" class="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg">🎲 Бросить</button>
              <button @click="emit('payJailFine')" :disabled="(currentPlayer?.money || 0) < 50" class="flex-1 px-3 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-400 text-white font-semibold rounded-lg">💸 50₽</button>
              <button @click="emit('useJailCard')" :disabled="(currentPlayer?.jailCards || 0) < 1" class="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-semibold rounded-lg">🎫 Карта</button>
            </div>

            <!-- Динамические кнопки -->
            <div v-else class="flex gap-3">
              <!-- Карта -->
              <button
                  v-if="store.pendingAction === 'CARD'"
                  @click="emit('pass')"
                  class="flex-1 px-4 py-2.5 text-white font-semibold rounded-lg transition shadow-sm"
                  :class="cardButton.color"
              >{{ cardButton.text }}</button>

              <!-- Покупка недвижимости -->
              <template v-else-if="store.pendingAction === 'BUY'">
                <button
                    @click="emit('buy')" :disabled="!canAfford"
                    class="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition shadow-sm"
                >Купить за {{ space.price }}₽</button>
                <button @click="emit('pass')" class="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition shadow-sm">Отказаться</button>
              </template>

              <!-- Инфо / Аренда -->
              <button
                  v-else-if="store.pendingAction === 'INFO'"
                  @click="emit('pass')"
                  class="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition shadow-sm"
              >Продолжить</button>

              <!-- Фоллбэк -->
              <button v-else @click="emit('close')" class="flex-1 px-4 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg transition">Закрыть</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>