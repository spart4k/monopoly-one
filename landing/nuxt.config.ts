// landing/nuxt.config.ts
export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  devtools: { enabled: true },

  modules: [
    '@nuxtjs/tailwindcss',
    '@vueuse/motion/nuxt', // Для простых анимаций
    '@nuxtjs/sitemap'     // Авто-генерация sitemap.xml
  ],

  // 🔹 SEO Настройки
  app: {
    head: {
      charset: 'utf-8',
      viewport: 'width=device-width, initial-scale=1',
      title: 'Монополия Онлайн — Играй с друзьями в браузере',
      meta: [
        { name: 'description', content: 'Классическая монополия в онлайне. Без скачивания, с чатом, сделками и статистикой. Создай комнату и начни игру за 1 минуту!' },
        { name: 'keywords', content: 'монополия онлайн, настольные игры, играть с друзьями, монополия бесплатно, monopoly online' },
        { name: 'robots', content: 'index, follow' },

        // 🔹 Open Graph (для красивых ссылок в Telegram/VK)
        { property: 'og:title', content: 'Монополия Онлайн' },
        { property: 'og:description', content: 'Заходи и играй с друзьями прямо сейчас!' },
        { property: 'og:image', content: '/og-image.jpg' }, // Создай картинку 1200x630
        { property: 'og:type', content: 'website' },
      ],
      link: [{ rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }]
    }
  },

  // 🔹 Sitemap конфигурация
  sitemap: {
    hostname: 'https://monopoly.yourdomain.com',
    gzip: true,
  },

  // 🔹 Runtime Config (ссылки на игру)
  runtimeConfig: {
    public: {
      gameUrl: process.env.NUXT_GAME_URL || 'http://localhost:5173',
      wsUrl: process.env.NUXT_WS_URL || 'ws://localhost:3000/ws'
    }
  }
})