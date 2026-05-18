<!-- client/src/components/PropertyModal.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/game'
import { useSession } from '../composables/useSession'
import { getSpaceById } from '../shared/boardConfig'
import type { ISpaceData } from '../shared/boardConfig'

const store = useGameStore()
const { myId } = useSession()

const props = defineProps<{
  isOpen: boolean
  space: ISpaceData | null
  actionRequired?: boolean
  myMoney?: number
  requiredAmount?: number
  isPropertyOwned?: boolean
  ownerName?: string
  isMyProperty?: boolean
  currentHouseCount?: number
  canBuyHouse?: boolean
  canSellHouse?: boolean
}>()

const emit = defineEmits<{
  close: [], buy: [], pass: [], buyHouse: [], sellHouse: [],
  rollForJail: [], payJailFine: [], useJailCard: [], mortgage: [], unmortgage: [], bankrupt: []
}>()

const isProperty = computed(() => props.space?.type === 'property' || props.space?.type === 'railroad')
const canAfford = computed(() => props.myMoney !== undefined && props.requiredAmount !== undefined && props.myMoney >= props.requiredAmount)
const currentPlayer = computed(() => store.players.find(p => p.id === store.currentTurn))

// 🔑 isActionTarget: это действие относится именно к этой ячейке?
const isActionTarget = computed(() => {
  if (!props.actionRequired) return false
  if (store.pendingAction === 'CARD' || store.pendingAction === 'INFO') return true
  return props.space?.id === store.selectedSpaceId
})

// 🔑 Режим долга
const isMandatoryPayment = computed(() => {
  if (store.pendingAction === 'INFO') return true
  if (store.pendingAction === 'CARD' && store.pendingCard?.action === 'pay') return true
  return false
})
const isDebt = computed(() => isMandatoryPayment.value && !canAfford.value)

// 🔑 Динамическая проверка домов в цветовой группе
const hasHousesInColorGroup = computed(() => {
  if (!props.space?.color || !myId.value || props.space.type !== 'property') return false
  const me = store.players.find(p => p.id === myId.value)
  if (!me) return false
  for (const id of me.properties) {
    const s = getSpaceById(id)
    if (s?.color === props.space.color && (me.houses?.[id] || 0) > 0) return true
  }
  return false
})

// 🔑 Залог
const isMortgaged = computed(() => {
  if (!props.space || !myId.value) return false
  const me = store.players.find(p => p.id === myId.value)
  return me?.mortgaged?.includes(props.space.id) || false
})

const canMortgage = computed(() => {
  if (!props.space || props.space.type !== 'property') return false
  const me = store.players.find(p => p.id === myId.value)
  if (!me || !me.properties.includes(props.space.id)) return false
  if (isMortgaged.value) return false
  if ((me.houses?.[props.space.id] || 0) > 0) return false
  if (hasHousesInColorGroup.value) return false
  return true
})

const mortgageValue = computed(() => props.space?.price ? Math.floor(props.space.price / 2) : 0)
const unmortgageCost = computed(() => Math.ceil(mortgageValue.value * 1.1))

const hasBothUtilities = computed(() => {
  if (!props.space || props.space.type !== 'utility') return false
  // Находим владельца текущей клетки
  const owner = props.isMyProperty
      ? store.players.find(p => p.id === myId.value)
      : store.players.find(p => p.properties?.includes(props.space?.id || -1))

  if (!owner) return false
  return owner.properties.includes(12) && owner.properties.includes(28)
})

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

const houseLabels = ['1 дом', '2 дома', '3 дома', '4 дома']

// 🔑 Ключ для перерисовки кнопок
const actionKey = computed(() => {
  const me = store.players.find(p => p.id === myId.value)
  if (!me) return 'no-me'
  return `${props.space?.id}-${me.housesBoughtThisTurn}-${me.houses?.[props.space?.id || 0] || 0}-${hasHousesInColorGroup.value}`
})

// 🔑 Проверка: есть ли у владельца ОБЕ коммуналки (12 и 28)
const hasFullUtilitySet = computed(() => {
  if (props.space?.type !== 'utility') return false
  const owner = props.isMyProperty
      ? store.players.find(p => p.id === myId.value)
      : store.players.find(p => p.properties?.includes(props.space?.id || -1))

  if (!owner) return false
  return owner.properties.includes(12) && owner.properties.includes(28)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="isOpen && space"
           class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
           @click.self="emit('close')">
        <div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden flex flex-col max-h-[90vh]"
             :class="isDebt ? 'ring-2 ring-red-400' : ''">

          <!-- Шапка -->
          <div class="p-4 text-white relative shrink-0 flex items-center gap-2"
               :class="[space.color || 'bg-gray-500', isDebt ? 'bg-red-100 !text-red-900' : '', space.textColor === 'text-gray-900' ? '!text-gray-900' : 'text-white']">
            <button @click="emit('close')" class="absolute top-3 right-3 opacity-70 hover:opacity-100 transition text-xl leading-none">✕</button>
            <div v-if="isDebt" class="text-2xl">⚠️</div>
            <div>
              <h3 class="text-xl font-bold">{{ space.name }}</h3>
              <span class="text-xs opacity-80 uppercase tracking-wider">{{ space.type }}</span>
            </div>
          </div>

          <!-- Тело -->
          <div class="p-4 space-y-4 text-gray-700 overflow-y-auto">
            <!-- 🃏 Карта -->
            <div v-if="store.pendingAction === 'CARD' && isActionTarget" class="text-center py-6 space-y-4 bg-orange-50 rounded-lg border border-orange-200">
              <div class="text-6xl">🃏</div>
              <p class="text-lg font-medium text-gray-800 leading-snug min-h-[3.5rem] flex items-center justify-center px-2">
                {{ store.pendingCard?.text || 'Загрузка карты...' }}
              </p>
            </div>

            <!-- 🏠 Недвижимость / 🚂 ЖД / ⚡ Коммуналки -->
            <div v-else-if="isProperty || space.type === 'utility'" class="space-y-4">

              <!-- Баннер аренды/оплаты -->
              <div v-if="isActionTarget && store.pendingAction === 'INFO'" class="p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
                <div class="text-4xl mb-1">{{ store.pendingInfo?.icon || '💸' }}</div>
                <h4 class="font-bold text-gray-800">{{ store.pendingInfo?.title }}</h4>
                <p class="text-sm text-gray-600">{{ store.pendingInfo?.message }}</p>
              </div>

              <!-- Инфо о владении -->
              <div v-if="isPropertyOwned" class="p-3 rounded-lg border" :class="isMyProperty ? 'bg-green-50 border-green-200 text-green-700' : 'bg-blue-50 border-blue-200 text-blue-700'">
                <div class="flex items-center gap-2 font-semibold">
                  <span>{{ isMyProperty ? '✅' : '🔑' }}</span>
                  <span>{{ isMyProperty ? 'Ваша собственность' : `Владелец: ${ownerName || 'Игрок'}` }}</span>
                </div>
                <div v-if="isMyProperty && currentHouseCount !== undefined && space.type === 'property'" class="text-sm mt-1 pl-6">
                  Зданий: {{ currentHouseCount === 0 ? 'Нет' : currentHouseCount === 5 ? '🏨 Отель' : `🏠 ${currentHouseCount}/4` }}
                </div>
                <div v-if="isMortgaged" class="text-sm mt-1 pl-6 text-gray-500 font-medium">🔒 Улица заложена</div>
              </div>

              <!-- Покупка -->
              <div v-else-if="isActionTarget && requiredAmount" class="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                <div class="flex justify-between items-center">
                  <span class="font-semibold">{{ store.pendingAction === 'BUY' ? 'Стоимость:' : 'К оплате:' }}</span>
                  <span class="text-2xl font-bold" :class="isDebt ? 'text-red-600' : 'text-green-600'">{{ requiredAmount }}₽</span>
                </div>
                <div class="text-sm text-gray-500">На балансе: <span :class="isDebt ? 'text-red-500 font-bold' : 'text-green-600'">{{ myMoney }}₽</span></div>
                <div v-if="isDebt" class="text-xs text-red-600 font-medium mt-1">🔴 Заложи имущество или предложи обмен</div>
              </div>

              <!-- 🔑 ТАБЛИЦА АРЕНДЫ (исправленная) -->
              <div class="border-t pt-3 mt-3">
                <h4 class="font-semibold mb-2 text-gray-800 text-sm">💰 Аренда:</h4>

                <!-- 🚂 ЖД Вокзалы -->
                <div v-if="space.type === 'railroad'" class="text-sm space-y-1 bg-gray-50 rounded-lg p-2">
                  <div class="flex justify-between"><span>1 станция</span><span class="font-mono">25₽</span></div>
                  <div class="flex justify-between"><span>2 станции</span><span class="font-mono">50₽</span></div>
                  <div class="flex justify-between"><span>3 станции</span><span class="font-mono">100₽</span></div>
                  <div class="flex justify-between"><span>4 станции</span><span class="font-mono">200₽</span></div>
                </div>

                <!-- ⚡ Коммунальные предприятия (ИСПРАВЛЕНО) -->
                <div v-else-if="space.type === 'utility'" class="text-sm space-y-2">
                  <div class="border rounded-lg overflow-hidden" :class="hasBothUtilities ? 'border-green-500 shadow-sm' : 'border-gray-200'">
                    <div class="flex justify-between p-2" :class="!hasBothUtilities ? 'bg-green-50 font-semibold text-gray-800' : 'bg-gray-50'">
                      <span>📏 1 предприятие:</span>
                      <span class="font-mono text-blue-600">Сумма кубиков × 4</span>
                    </div>
                    <div class="flex justify-between p-2 border-t" :class="hasBothUtilities ? 'bg-green-100 font-semibold text-green-800' : 'bg-gray-50'">
                      <span>📏 2 предприятия:</span>
                      <span class="font-mono text-blue-600">Сумма кубиков × 10</span>
                    </div>
                  </div>

                  <div v-if="hasBothUtilities" class="flex items-center justify-center gap-1 text-xs text-green-700 bg-green-50 py-1.5 px-2 rounded border border-green-300">
                    <span>✅</span> Полный комплект: аренда ×10
                  </div>

                  <p class="text-xs text-gray-500 text-center mt-1">
                    💡 Аренда зависит от броска кубиков. К оплате сейчас: <span class="font-bold text-gray-800">{{ requiredAmount || '...' }}₽</span>
                  </p>
                </div>

                <!-- 🏠 Обычные улицы -->
                <template v-else-if="space.type === 'property'">
                  <table class="w-full text-sm bg-gray-50 rounded-lg overflow-hidden">
                    <tr class="border-b" :class="{ 'bg-blue-50 font-semibold text-blue-700': currentHouseCount === 0 }">
                      <td class="py-2 pl-3"><span v-if="currentHouseCount === 0">✅ </span>Базовая</td>
                      <td class="text-right font-mono pr-3">{{ space.baseRent }}₽</td>
                    </tr>
                    <tr v-if="space.rentWithHouse" v-for="(rent, i) in space.rentWithHouse" :key="i" class="border-b" :class="{ 'bg-blue-50 font-semibold text-blue-700': currentHouseCount === i + 1 }">
                      <td class="py-2 pl-3"><span v-if="currentHouseCount === i + 1">✅ </span>{{ ['1 дом','2 дома','3 дома','4 дома'][i] }}</td>
                      <td class="text-right font-mono pr-3">{{ rent }}₽</td>
                    </tr>
                    <tr v-if="space.rentWithHotel" class="border-b-2" :class="{ 'bg-purple-50 font-bold text-purple-700': currentHouseCount === 5 }">
                      <td class="py-2 pl-3"><span v-if="currentHouseCount === 5">✅ </span>🏨 Отель</td>
                      <td class="text-right font-mono pr-3">{{ space.rentWithHotel }}₽</td>
                    </tr>
                  </table>
                </template>
              </div>

              <!-- 🔑 Управление (только для property, НЕ для utility/railroad) -->
              <!-- 🔹 Найди старый div с кнопками и замени на этот -->
              <div v-if="isMyProperty && space.type === 'property'" :key="actionKey" class="pt-3 border-t border-gray-200 mt-3 space-y-2">
                <div class="flex justify-between text-xs text-gray-500 px-1">
                  <span>Стоимость дома</span>
                  <span class="font-mono font-bold">{{ space.houseCost }}₽</span>
                </div>

                <div class="grid grid-cols-2 gap-2">
                  <button @click="emit('buyHouse')" :disabled="!canBuyHouse"
                          class="px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-xs rounded-lg transition font-medium">
                    🏠 Купить
                  </button>
                  <button @click="emit('sellHouse')" :disabled="!canSellHouse"
                          class="px-3 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-xs rounded-lg transition font-medium">
                    💰 Продать
                  </button>
                </div>

                <!-- Залог/Выкуп -->
                <div class="grid grid-cols-2 gap-2 pt-1">
                  <button v-if="!isMortgaged && canMortgage" @click="emit('mortgage')"
                          class="px-2 py-1.5 bg-gray-600 hover:bg-gray-700 text-white text-xs rounded-lg transition">
                    🔒 Заложить за {{ mortgageValue }}₽
                  </button>
                  <button v-else-if="isMortgaged" @click="emit('unmortgage')"
                          class="px-2 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs rounded-lg transition">
                    🔓 Выкупить за {{ unmortgageCost }}₽
                  </button>
                </div>
              </div>
            </div>

            <!-- ℹ️ Прочие (налоги) -->
            <div v-else-if="isActionTarget && space.type === 'tax' && requiredAmount" class="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
              <div class="flex justify-between items-center">
                <span class="font-semibold">К оплате:</span>
                <span class="text-2xl font-bold" :class="isDebt ? 'text-red-600' : 'text-green-600'">{{ requiredAmount }}₽</span>
              </div>
              <div class="text-sm text-gray-500">На балансе: <span :class="isDebt ? 'text-red-500 font-bold' : 'text-green-600'">{{ myMoney }}₽</span></div>
              <div v-if="isDebt" class="text-xs text-red-600 font-medium mt-1">🔴 Заложи имущество или предложи обмен</div>
            </div>
          </div>

          <!-- 🔻 Футер -->
          <div class="p-4 bg-gray-50 flex flex-col gap-2 border-t shrink-0">
            <!-- 🔴 РЕЖИМ ДОЛГА -->
            <template v-if="isDebt">
              <div class="flex gap-2 mb-2">
                <button @click="emit('bankrupt')" class="flex-1 px-3 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition">🏳️ Банкротство</button>
                <button @click="emit('close')" class="flex-1 px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg transition">Закрыть</button>
              </div>
              <p class="text-xs text-gray-500 text-center">💡 Закрой окно, заложи имущество или предложи обмен</p>
            </template>

            <!-- 🟢 АКТИВНОЕ ДЕЙСТВИЕ -->
            <template v-else-if="isActionTarget">
              <div v-if="store.pendingAction === 'BUY'" class="flex gap-3">
                <button @click="emit('buy')" :disabled="!canAfford" class="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition shadow-sm relative">
                  <template v-if="canAfford">Купить за {{ requiredAmount }}₽</template>
                  <template v-else>Не хватает {{ requiredAmount - (myMoney || 0) }}₽</template>
                </button>
                <button @click="emit('pass')" class="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition shadow-sm">Отказаться</button>
              </div>
              <button v-else-if="store.pendingAction === 'CARD'" @click="emit('pass')" class="flex-1 px-4 py-2.5 text-white font-semibold rounded-lg transition shadow-sm" :class="cardButton.color">{{ cardButton.text }}</button>
              <button v-else-if="store.pendingAction === 'INFO'" @click="emit('pass')" class="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition shadow-sm">✅ Продолжить</button>
            </template>

            <!-- 🏠 ПРОСМОТР / ЗАКРЫТИЕ -->
            <template v-else>
              <button @click="emit('close')" class="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg transition">Закрыть</button>
            </template>
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