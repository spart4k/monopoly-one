<!-- landing/components/CallToAction.vue -->
<template>
  <section class="py-20 bg-blue-600 text-white text-center">
    <div class="container mx-auto px-4">
      <h2 class="text-3xl lg:text-5xl font-bold mb-6">Готов стать магнатом?</h2>
      <p class="text-blue-100 text-lg mb-8 max-w-2xl mx-auto">
        Присоединяйся к тысячам игроков. Создай свою первую комнату и покажи, кто тут главный!
      </p>
      <NuxtLink
          to="/game"
          class="inline-block px-10 py-5 bg-white text-blue-600 rounded-xl font-bold text-xl hover:bg-gray-100 transition shadow-xl hover:shadow-2xl transform hover:-translate-y-1"
      >
        🚀 Играть сейчас
      </NuxtLink>
    </div>
  </section>
</template>