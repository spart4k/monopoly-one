<!-- landing/pages/index.vue -->
<script setup lang="ts">
import AppHeader from '~/components/AppHeader.vue'
import HeroSection from '~/components/HeroSection.vue'
import FeaturesGrid from '~/components/FeaturesGrid.vue'
import CallToAction from '~/components/CallToAction.vue'

// 🔹 SEO Schema.org (JSON-LD) для поисковиков
useHead({
  script: [{
    type: 'application/ld+json',
    children: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "VideoGame",
      "name": "Монополия Онлайн",
      "description": "Браузерная версия классической настольной игры с поддержкой мультиплеера.",
      "genre": ["Board Game", "Strategy", "Multiplayer"],
      "playMode": "MultiPlayer",
      "url": "https://monopoly.yourdomain.com"
    })
  }]
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-blue-200">
    <AppHeader />

    <main>
      <HeroSection />
      <FeaturesGrid />
      <CallToAction />
    </main>

    <footer class="py-6 text-center text-sm text-gray-500 bg-white border-t">
      <p>© {{ new Date().getFullYear() }} Monopoly Online. Все права защищены.</p>
    </footer>
  </div>
</template>