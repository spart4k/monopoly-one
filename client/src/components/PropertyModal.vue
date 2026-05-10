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
}>()

const emit = defineEmits<{
  close: []
  buy: []
  pass: []
}>()

const isProperty = computed(() =>
    props.space?.type === 'property' || props.space?.type === 'railroad'
)

const isCardAction = computed(() =>
    store.pendingAction === 'CARD' && store.pendingCardText
)

const canAfford = computed(() =>
    props.myMoney !== undefined &&
    props.space?.price !== undefined &&
    props.myMoney >= props.space.price
)

const houseLabels = ['1 дом', '2 дома', '3 дома', '4 дома']
const isInfoAction = computed(() => store.pendingAction === 'INFO' && store.pendingInfo)

const isJailAction = computed(() =>
    store.players.find(p => p.id === store.currentTurn)?.isInJail && store.currentTurn === myId.value
)
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
          v-if="isOpen && space"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          @click.self="emit('close')"
      >
        <div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
          <!-- 🔷 Шапка -->
          <div
              class="p-4 text-white relative"
              :class="[space.color, space.textColor === 'text-gray-900' ? 'text-gray-900' : 'text-white']"
          >
            <button @click="emit('close')" class="absolute top-3 right-3 opacity-70 hover:opacity-100 transition">✕</button>
            <h3 class="text-xl font-bold">{{ space.name }}</h3>
            <span class="text-xs opacity-80 uppercase tracking-wider">{{ space.type }}</span>
          </div>

          <!-- 🔶 Тело -->
          <div class="p-4 space-y-4 text-gray-700">
            <!-- Описание (налоги, коммуналки) -->
            <div v-if="space.description && !isCardAction" class="text-sm bg-gray-100 p-2 rounded italic">
              {{ space.description }}
            </div>

            <!-- 🃏 Карта Шанс / Казна -->
            <div v-if="isCardAction" class="text-center py-6 space-y-3 bg-orange-50 rounded-lg border border-orange-200">
              <div class="text-4xl">🃏</div>
              <p class="text-lg font-medium text-gray-800 leading-snug">{{ store.pendingCardText }}</p>
            </div>

            <!-- 🏠 Недвижимость -->
            <div v-else-if="isProperty" class="space-y-3">
              <!-- Статус владения -->
              <div v-if="isPropertyOwned" class="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div class="flex items-center gap-2 text-green-700 font-semibold">
                  <span>✅</span>
                  <span>Принадлежит: {{ ownerName || 'Игроку' }}</span>
                </div>
              </div>

              <!-- Предложение купить -->
              <div v-else-if="actionRequired && space.price > 0" class="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                <div class="flex justify-between items-center">
                  <span class="font-semibold">Купить за:</span>
                  <span class="text-2xl font-bold text-green-600">{{ space.price }}₽</span>
                </div>
                <div class="text-sm text-gray-500">
                  На балансе: <span :class="canAfford ? 'text-green-600 font-semibold' : 'text-red-500'">{{ myMoney }}₽</span>
                </div>
              </div>

              <!-- Таблица аренды -->
              <div class="border-t pt-3">
                <h4 class="font-semibold mb-2">Аренда:</h4>
                <table class="w-full text-sm">
                  <tr class="border-b">
                    <td class="py-1">Базовая</td>
                    <td class="text-right font-mono">{{ space.baseRent }}₽</td>
                  </tr>
                  <tr v-for="(rent, i) in space.rentWithHouse" :key="i" class="border-b">
                    <td class="py-1">{{ houseLabels[i] }}</td>
                    <td class="text-right font-mono">{{ rent }}₽</td>
                  </tr>
                  <tr class="font-bold text-blue-600">
                    <td class="py-2">С отелем</td>
                    <td class="text-right font-mono">{{ space.rentWithHotel }}₽</td>
                  </tr>
                </table>
              </div>

              <!-- Доп. инфо -->
              <div class="flex justify-between text-sm text-gray-500 pt-2 border-t">
                <span>Стоимость дома</span>
                <span class="font-mono">{{ space.houseCost }}₽</span>
              </div>
              <div class="flex justify-between text-sm text-gray-500">
                <span>Залог</span>
                <span class="font-mono">{{ space.mortgageValue }}₽</span>
              </div>
            </div>

            <!-- ℹ️ Прочие клетки -->
            <div v-else class="text-center py-4 text-gray-500">
              <span v-if="space.type === 'tax'">📉 Заплатите налог</span>
              <span v-else>ℹ️ Информационное поле</span>
            </div>
          </div>

          <!-- 📜 INFO модалка -->
          <div v-if="isInfoAction" class="text-center py-8 space-y-4">
            <div class="text-6xl mb-2">{{ store.pendingInfo?.icon }}</div>
            <h3 class="text-2xl font-bold text-gray-800">{{ store.pendingInfo?.title }}</h3>
            <p class="text-gray-600 text-lg leading-relaxed max-w-xs mx-auto">{{ store.pendingInfo?.message }}</p>
          </div>

          <!-- 🔒 Модалка тюрьмы -->
          <div v-if="isJailAction" class="text-center py-6 space-y-4 bg-red-50 rounded-lg border border-red-200">
            <div class="text-5xl">🔒</div>
            <h3 class="text-xl font-bold text-gray-800">Вы в тюрьме</h3>
            <p class="text-gray-600">Попыток осталось: {{ store.currentPlayer?.jailTurns ?? 0 }}/3</p>
          </div>

          <!-- 🔻 Футер с кнопками -->
          <div class="p-4 bg-gray-50 flex gap-3 border-t">
            <div v-if="isJailAction" class="flex gap-2">
              <button @click="emit('rollForJail')" class="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg">🎲 Бросить (дубль)</button>
              <button @click="emit('payJailFine')" :disabled="(store.players.find(p=>p.id===store.currentTurn)?.money || 0) < 50" class="flex-1 px-3 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-400 text-white font-semibold rounded-lg">💸 Заплатить 50₽</button>
              <button @click="emit('useJailCard')" :disabled="(store.players.find(p=>p.id===store.currentTurn)?.jailCards || 0) < 1" class="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-semibold rounded-lg">🎫 Карта</button>
            </div>

            <!-- Купить -->
            <button
                v-if="actionRequired && space.price > 0 && !isPropertyOwned"
                @click="emit('buy')" :disabled="!canAfford"
                class="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition shadow-sm"
            >Купить за {{ space.price }}₽</button>

            <!-- Пропустить / Продолжить -->
            <button
                v-if="actionRequired"
                @click="emit('pass')"
                class="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition shadow-sm"
            >{{ isCardAction || isInfoAction ? 'Продолжить' : 'Пропустить' }}</button>

            <!-- Закрыть (если действие не требуется) -->
            <button v-else @click="emit('close')" class="flex-1 px-4 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg transition shadow-sm">Закрыть</button>
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