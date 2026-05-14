<!-- client/src/components/AuthModal.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '../composables/useAuth'

const emit = defineEmits<{ close: [] }>()
const { login, register, error, loading } = useAuth()

const isLogin = ref(true)
const email = ref('')
const nickname = ref('')
const password = ref('')

const handleSubmit = async () => {
  if (isLogin.value) {
    const success = await login(email.value, password.value)
    if (success) emit('close')
  } else {
    const success = await register(email.value, nickname.value, password.value)
    if (success) emit('close')
  }
}
</script>

<template>
  <div class="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
    <div class="bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-700">
      <div class="p-5 text-center bg-gradient-to-r from-blue-600 to-indigo-600">
        <h2 class="text-xl font-bold text-white">{{ isLogin ? 'Вход' : 'Регистрация' }}</h2>
      </div>

      <form @submit.prevent="handleSubmit" class="p-5 space-y-4">
        <div v-if="!isLogin">
          <label class="block text-sm text-gray-400 mb-1">Никнейм</label>
          <input v-model="nickname" type="text" required minlength="3" maxlength="32"
                 class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                 placeholder="Игрок123">
        </div>

        <div>
          <label class="block text-sm text-gray-400 mb-1">Email</label>
          <input v-model="email" type="email" required
                 class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                 placeholder="you@example.com">
        </div>

        <div>
          <label class="block text-sm text-gray-400 mb-1">Пароль</label>
          <input v-model="password" type="password" required minlength="6"
                 class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                 placeholder="••••••••">
        </div>

        <div v-if="error" class="text-red-400 text-sm bg-red-900/30 px-3 py-2 rounded-lg border border-red-800">
          ❌ {{ error }}
        </div>

        <button type="submit" :disabled="loading"
                class="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold rounded-lg transition">
          {{ loading ? 'Проверка...' : (isLogin ? 'Войти' : 'Зарегистрироваться') }}
        </button>

        <p class="text-center text-sm text-gray-400">
          {{ isLogin ? 'Нет аккаунта?' : 'Уже есть аккаунт?' }}
          <button type="button" @click="isLogin = !isLogin" class="text-blue-400 hover:underline font-medium ml-1">
            {{ isLogin ? 'Создать' : 'Войти' }}
          </button>
        </p>
      </form>

      <div class="px-5 py-3 bg-gray-700/30 border-t border-gray-700 text-center">
        <button @click="emit('close')" class="text-sm text-gray-400 hover:text-gray-200 transition">✕ Закрыть</button>
      </div>
    </div>
  </div>
</template>