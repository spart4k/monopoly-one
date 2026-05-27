<!-- client/src/components/NicknameForm.vue -->
<script setup lang="ts">
import { ref, watch } from 'vue'  // 🔹 Добавили watch
import { useSession } from '../composables/useSession'
import { sendEvent } from '../lib/ws'

const { playerName, setPlayerName, ensureSession } = useSession()
const nickname = ref(playerName.value || '')
const error = ref('')
const isLoading = ref(false)

const emit = defineEmits<{
  (e: 'submit', name: string): void
}>()

// 🔹 Авто-сброс лоадера, когда ник успешно зарегистрирован
watch(playerName, (newName, oldName) => {
  if (oldName === '' && newName && isLoading.value) {
    console.log('✅ [NicknameForm] Registration succeeded, resetting loader')
    isLoading.value = false
    emit('submit', newName)  // 🔹 Сообщаем родителю, что всё ок
  }
})

const validateNickname = (name: string): boolean => {
  if (!name.trim()) {
    error.value = 'Введите имя'
    return false
  }
  if (name.length < 2) {
    error.value = 'Минимум 2 символа'
    return false
  }
  if (name.length > 20) {
    error.value = 'Максимум 20 символов'
    return false
  }
  if (!/^[\w\s\u0400-\u04FF\-]+$/u.test(name.trim())) {
    error.value = 'Только буквы, цифры, пробелы и -'
    return false
  }
  return true
}

const handleSubmit = async () => {
  error.value = ''
  const cleanName = nickname.value.trim()

  if (!cleanName || cleanName.length < 2) {
    error.value = 'Минимум 2 символа'
    return
  }
  if (cleanName.length > 20 || !/^[\w\s\u0400-\u04FF\-]+$/u.test(cleanName)) {
    error.value = 'Только буквы, цифры, пробелы и -'
    return
  }

  isLoading.value = true
  sendEvent({ type: 'SET_NICKNAME', nickname: cleanName })

  // 🔹 Страховка: если сервер не ответил за 5 сек
  setTimeout(() => {
    if (isLoading.value) {
      console.warn('⚠️ [NicknameForm] No response from server, resetting loader')
      isLoading.value = false
      error.value = 'Сервер не отвечает. Попробуйте ещё раз.'
    }
  }, 5000)
}

const handleRandomName = () => {
  const adjectives = ['Весёлый', 'Хитрый', 'Быстрый', 'Мудрый', 'Отважный', 'Ловкий']
  const nouns = ['Игрок', 'Богач', 'Стратег', 'Магнат', 'Лидер', 'Чемпион']
  const num = Math.floor(Math.random() * 1000)
  nickname.value = `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}${num}`
  error.value = ''
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
    <div class="w-full max-w-md bg-gray-800/90 backdrop-blur rounded-2xl p-6 md:p-8 shadow-2xl border border-gray-700">
      <!-- 🎲 Заголовок -->
      <div class="text-center mb-6">
        <div class="text-5xl mb-2">🎲</div>
        <h1 class="text-2xl md:text-3xl font-bold text-white">Монополия</h1>
        <p class="text-gray-400 text-sm mt-1">Введите имя для начала игры</p>
      </div>

      <!-- ✏️ Форма ввода ника -->
      <form @submit.prevent="handleSubmit" class="space-y-4">
        <div>
          <label for="nickname" class="block text-sm font-medium text-gray-300 mb-1">Ваш никнейм</label>
          <input
              id="nickname"
              v-model="nickname"
              type="text"
              placeholder="Например: Admin"
              maxlength="20"
              class="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
              :disabled="isLoading"
              @input="error = ''"
          />
          <p v-if="error" class="mt-1 text-sm text-red-400">{{ error }}</p>
          <p class="mt-1 text-xs text-gray-500">{{ nickname.length }}/20</p>
        </div>

        <!-- 🔘 Кнопки -->
        <div class="flex gap-3">
          <button
              type="button"
              @click="handleRandomName"
              class="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium rounded-xl transition disabled:opacity-50"
              :disabled="isLoading"
          >
            🎲 Случайный
          </button>
          <button
              type="submit"
              class="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
              :disabled="isLoading || !nickname.trim()"
          >
            <span v-if="isLoading" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            {{ isLoading ? 'Подключение...' : 'Играть' }}
          </button>
        </div>
      </form>

      <!-- ℹ️ Подсказка -->
      <div class="mt-6 pt-4 border-t border-gray-700 text-center">
        <p class="text-xs text-gray-500">
          🔹 Регистрация не требуется<br>
          🔹 Ник виден другим игрокам<br>
          🔹 Можно изменить при следующем входе
        </p>
      </div>
    </div>
  </div>
</template>