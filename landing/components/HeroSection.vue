<!-- landing/components/HeroSection.vue -->
<template>
  <section class="relative overflow-hidden py-20 lg:py-32">
    <!-- Фоновый градиент -->
    <div class="absolute inset-0 bg-gradient-to-br from-blue-600 to-indigo-800 opacity-10 -z-10" />

    <div class="container mx-auto px-4 flex flex-col lg:flex-row items-center gap-12">

      <!-- Текст -->
      <div class="flex-1 text-center lg:text-left">
        <h1
            class="text-4xl lg:text-6xl font-extrabold tracking-tight text-gray-900 mb-6"
            v-motion:slide-visible="{ delay: 100, duration: 800 }"
        >
          Классическая <span class="text-blue-600">Монополия</span> <br>
          теперь в онлайне
        </h1>

        <p
            class="text-lg text-gray-600 mb-8 max-w-xl mx-auto lg:mx-0"
            v-motion:slide-visible="{ delay: 300, duration: 800 }"
        >
          Играй с друзьями без скачивания. Реальные торги, чат, статистика и сохранение прогресса. Создай комнату за 1 минуту!
        </p>

        <div
            class="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
            v-motion:slide-visible="{ delay: 500, duration: 800 }"
        >
          <NuxtLink
              to="/game"
              class="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-lg transition shadow-lg shadow-blue-600/30 transform hover:-translate-y-1"
          >
            🎲 Начать игру бесплатно
          </NuxtLink>
          <a
              href="#features"
              class="px-8 py-4 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl font-medium text-lg transition"
          >
            Узнать больше
          </a>
        </div>
      </div>

      <!-- Анимированная 3D-иллюстрация (кубик/карта) -->
      <div
          class="flex-1 relative flex justify-center"
          v-motion:scale-visible="{ delay: 200, duration: 1000 }"
      >
        <!-- Простая CSS анимация плавания -->
        <div class="animate-float relative w-64 h-64 lg:w-96 lg:h-96 bg-gradient-to-tr from-yellow-400 to-orange-500 rounded-3xl shadow-2xl flex items-center justify-center border-4 border-white/20 backdrop-blur-sm">
          <span class="text-8xl lg:text-9xl filter drop-shadow-lg">🎲</span>

          <!-- Плавающие элементы вокруг -->
          <span class="absolute -top-6 -right-6 text-5xl animate-bounce delay-700">💰</span>
          <span class="absolute -bottom-4 -left-8 text-5xl animate-bounce delay-300">🏠</span>
        </div>
      </div>

    </div>
  </section>
</template>

<style scoped>
/* Кастомная анимация плавания */
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-20px); }
}
.animate-float {
  animation: float 6s ease-in-out infinite;
}
</style>