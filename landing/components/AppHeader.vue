<!-- landing/components/AppHeader.vue -->
<template>
  <header class="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-200">
    <div class="container mx-auto px-4 h-16 flex items-center justify-between">
      <NuxtLink to="/" class="text-xl font-bold text-blue-600 flex items-center gap-2 hover:opacity-80 transition">
        🎲 Монополия Онлайн
      </NuxtLink>

      <nav class="hidden md:flex items-center gap-6">
        <a href="#features" class="text-gray-600 hover:text-blue-600 font-medium transition">Преимущества</a>
        <a href="#how-to-play" class="text-gray-600 hover:text-blue-600 font-medium transition">Как играть</a>
      </nav>

      <NuxtLink to="/game" class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition shadow-md hover:shadow-lg">
        🚀 Играть бесплатно
      </NuxtLink>
    </div>
  </header>
  <!-- Компенсация высоты фиксированного хедера -->
  <div class="h-16"></div>
</template>