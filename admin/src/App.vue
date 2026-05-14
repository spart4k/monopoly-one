<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from './composables/useAuth'
import Dashboard from './views/Dashboard.vue'

const { user, token, login, logout, error, loading } = useAuth()
const email = ref('admin@monopoly.local')
const password = ref('Admin123!')

const handleLogin = async () => {
  await login(email.value.trim(), password.value)
}
</script>

<template>
  <v-app>
    <!-- 🔝 Верхняя панель (только если авторизован) -->
    <v-app-bar v-if="token" color="primary" density="compact">
      <v-app-bar-title>🏛 Monopoly Admin</v-app-bar-title>
      <v-spacer></v-spacer>
      <v-chip class="mr-2" color="white" variant="outlined">
        {{ user?.nickname }} ({{ user?.role }})
      </v-chip>
      <v-btn variant="text" color="white" @click="logout">Выйти</v-btn>
    </v-app-bar>

    <v-main>
      <!-- 🔹 Экран входа -->
      <template v-if="!token">
        <v-container class="d-flex align-center justify-center" style="height: 100vh">
          <v-card width="400" class="pa-6" elevation="4">
            <div class="text-center mb-4">
              <v-icon size="64" color="primary">mdi-shield-account</v-icon>
              <h2 class="text-h5 font-weight-bold mt-2">Вход в админку</h2>
            </div>

            <v-alert v-if="error" type="error" variant="tonal" class="mb-4" density="compact">
              {{ error }}
            </v-alert>

            <v-form @submit.prevent="handleLogin">
              <v-text-field
                  v-model="email"
                  label="Email"
                  type="email"
                  required
                  prepend-inner-icon="mdi-email"
                  :disabled="loading"
                  autofocus
              />

              <v-text-field
                  v-model="password"
                  label="Пароль"
                  type="password"
                  required
                  prepend-inner-icon="mdi-lock"
                  :disabled="loading"
                  @keyup.enter="handleLogin"
              />

              <v-btn
                  block
                  color="primary"
                  size="large"
                  :loading="loading"
                  type="submit"
                  class="mt-2"
              >
                {{ loading ? 'Проверка...' : 'Войти' }}
              </v-btn>
            </v-form>
          </v-card>
        </v-container>
      </template>

      <!-- 🔹 Дашборд (только если авторизован) -->
      <Dashboard v-else />
    </v-main>
  </v-app>
</template>