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

const isProperty = computed(() =>
    props.space?.type === 'property' || props.space?.type === 'railroad'
)
const isCardAction = computed(() =>
    store.pendingAction === 'CARD' && store.pendingCardText
)
const isInfoAction = computed(() =>
    store.pendingAction === 'INFO' && store.pendingInfo
)
const canAfford = computed(() =>
    props.myMoney !== undefined &&
    props.space?.price !== undefined &&
    props.myMoney >= props.space.price
)
const currentPlayer = computed(() =>
    store.players.find(p => p.id === store.currentTurn)
)
const isJailAction = computed(() =>
    currentPlayer.value?.isInJail && store.pendingAction === 'INFO'
)
const houseLabels = ['1 дом', '2 дома', '3 дома', '4 дома']
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
          v-if="isOpen && space"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          @click.self="emit('close')"
      >
        <div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden flex flex-col max-h-[90vh]">

          <!-- Шапка -->
          <div
              class="p-4 text-white relative shrink-0"
              :class="[space.color || 'bg-gray-500', space.textColor === 'text-gray-900' ? 'text-gray-900' : 'text-white']"
          >
            <button @click="emit('close')" class="absolute top-3 right-3 opacity-70 hover:opacity-100 transition text-xl leading-none">✕</button>
            <h3 class="text-xl font-bold">{{ space.name }}</h3>
            <span class="text-xs opacity-80 uppercase tracking-wider">{{ space.type }}</span>
          </div>

          <!-- Тело -->
          <div class="p-4 space-y-4 text-gray-700 overflow-y-auto">

            <!-- Карта -->
            <div v-if="isCardAction" class="text-center py-6 space-y-3 bg-orange-50 rounded-lg border border-orange-200">
              <div class="text-4xl">🃏</div>
              <p class="text-lg font-medium text-gray-800 leading-snug">{{ store.pendingCardText }}</p>
            </div>

            <!-- Инфо / Тюрьма -->
            <div v-else-if="isInfoAction" class="text-center py-6 space-y-4">
              <div v-if="isJailAction" class="text-5xl">🔒</div>
              <div v-else class="text-6xl">{{ store.pendingInfo?.icon }}</div>
              <h3 class="text-2xl font-bold text-gray-800">{{ isJailAction ? 'Вы в тюрьме' : store.pendingInfo?.title }}</h3>
              <p class="text-gray-600 text-lg leading-relaxed">
                {{ isJailAction ? `Попыток осталось: ${currentPlayer?.jailTurns ?? 0}/3` : store.pendingInfo?.message }}
              </p>
            </div>

            <!-- Недвижимость -->
            <div v-else-if="isProperty" class="space-y-4">
              <!-- Владение -->
              <div v-if="isPropertyOwned" class="p-3 rounded-lg border" :class="isMyProperty ? 'bg-green-50 border-green-200 text-green-700' : 'bg-blue-50 border-blue-200 text-blue-700'">
                <div class="flex items-center gap-2 font-semibold">
                  <span>{{ isMyProperty ? '✅' : '🔑' }}</span>
                  <span>{{ isMyProperty ? 'Ваша собственность' : `Владелец: ${ownerName || 'Игрок'}` }}</span>
                </div>
                <div v-if="isMyProperty && currentHouseCount !== undefined" class="text-sm mt-1 pl-6">
                  Зданий: {{ currentHouseCount === 0 ? 'Нет' : currentHouseCount === 5 ? '🏨 Отель' : `🏠 ${currentHouseCount}/4` }}
                </div>
              </div>

              <!-- Покупка -->
              <div v-else-if="actionRequired && space.price > 0" class="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                <div class="flex justify-between items-center">
                  <span class="font-semibold">Купить за:</span>
                  <span class="text-2xl font-bold text-green-600">{{ space.price }}₽</span>
                </div>
                <div class="text-sm text-gray-500">
                  На балансе: <span :class="canAfford ? 'text-green-600 font-semibold' : 'text-red-500'">{{ myMoney }}₽</span>
                </div>
              </div>

              <!-- Аренда -->
              <div class="border-t pt-3">
                <h4 class="font-semibold mb-2">Аренда:</h4>
                <table class="w-full text-sm">
                  <tr class="border-b">
                    <td class="py-1">Базовая</td>
                    <td class="text-right font-mono">{{ space.baseRent }}₽</td>
                  </tr>
                  <tr v-if="space.rentWithHouse" v-for="(rent, i) in space.rentWithHouse" :key="i" class="border-b">
                    <td class="py-1">{{ houseLabels[i] }}</td>
                    <td class="text-right font-mono">{{ rent }}₽</td>
                  </tr>
                  <tr v-if="space.rentWithHotel" class="font-bold text-blue-600">
                    <td class="py-2">С отелем</td>
                    <td class="text-right font-mono">{{ space.rentWithHotel }}₽</td>
                  </tr>
                </table>
              </div>

              <!-- Дома -->
              <div v-if="isMyProperty && space.type === 'property'" class="pt-2 border-t space-y-2">
                <div class="flex justify-between text-sm text-gray-500">
                  <span>Стоимость дома</span>
                  <span class="font-mono">{{ space.houseCost }}₽</span>
                </div>
                <div class="flex gap-2">
                  <button @click="emit('buyHouse')" :disabled="!canBuyHouse" class="flex-1 px-2 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-xs rounded-lg transition">🏠 Купить</button>
                  <button @click="emit('sellHouse')" :disabled="!canSellHouse" class="flex-1 px-2 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-xs rounded-lg transition">💰 Продать</button>
                </div>
              </div>
            </div>

            <!-- Прочее -->
            <div v-else class="text-center py-4 text-gray-500">
              <span v-if="space.type === 'tax'">📉 Заплатите налог</span>
              <span v-else-if="space.type === 'go'">🏁 СТАРТ</span>
              <span v-else>ℹ️ Информационное поле</span>
            </div>
          </div>

          <!-- Футер -->
          <div class="p-4 bg-gray-50 flex flex-col gap-2 border-t shrink-0">
            <!-- Тюрьма -->
            <div v-if="isJailAction" class="flex gap-2">
              <button @click="emit('rollForJail')" class="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg">🎲 Бросить</button>
              <button @click="emit('payJailFine')" :disabled="(currentPlayer?.money || 0) < 50" class="flex-1 px-3 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-400 text-white font-semibold rounded-lg">💸 50₽</button>
              <button @click="emit('useJailCard')" :disabled="(currentPlayer?.jailCards || 0) < 1" class="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-semibold rounded-lg">🎫 Карта</button>
            </div>

            <!-- Обычные кнопки -->
            <div v-else class="flex gap-3">
              <button
                  v-if="actionRequired && space.price > 0 && !isPropertyOwned"
                  @click="emit('buy')" :disabled="!canAfford"
                  class="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition"
              >Купить за {{ space.price }}₽</button>

              <button
                  v-if="actionRequired || isPropertyOwned"
                  @click="emit('pass')"
                  class="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition"
              >{{ isCardAction || isInfoAction ? 'Продолжить' : 'Пропустить' }}</button>

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