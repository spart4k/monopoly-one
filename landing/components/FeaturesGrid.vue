<!-- landing/components/FeaturesGrid.vue -->
<script setup>
const features = [
  { icon: '🌐', title: 'Без скачивания', desc: 'Запускается прямо в браузере на ПК и телефоне.' },
  { icon: '👥', title: 'Мультиплеер', desc: 'Играй с друзьями в одной комнате в реальном времени.' },
  { icon: '📊', title: 'Статистика', desc: 'История матчей, рейтинги и логи всех действий.' },
  { icon: '🔒', title: 'Безопасность', desc: 'Авторизация, защита от дублей и честная игра.' },
]
</script>

<template>
  <section id="features" class="py-20 bg-white">
    <div class="container mx-auto px-4">
      <h2 class="text-3xl font-bold text-center mb-12">Почему выбирают нас?</h2>
      <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
        <div
            v-for="(f, i) in features"
            :key="i"
            class="p-6 rounded-2xl bg-gray-50 hover:bg-blue-50 transition duration-300 border border-transparent hover:border-blue-100"
            v-motion:slide-visible="{ delay: i * 100 }"
        >
          <div class="text-4xl mb-4">{{ f.icon }}</div>
          <h3 class="text-xl font-bold mb-2">{{ f.title }}</h3>
          <p class="text-gray-600">{{ f.desc }}</p>
        </div>
      </div>
    </div>
  </section>
</template>