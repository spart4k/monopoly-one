// admin/vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    vue(),
    vuetify({ autoImport: true }) // 🔹 Авто-импорт компонентов Vuetify
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)) // 🔹 Алиас для импортов
    }
  },
  base: '/admin/',

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    port: 5174, // 🔹 Чтобы не конфликтовал с основным клиентом (5173)
    proxy: {
      '/admin': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      }
    }
  },
  define: {
    'process.env': {} // 🔹 Фикс для Vuetify + Vite
  },
  optimizeDeps: {
    exclude: ['vuetify'], // 🔹 Оптимизация для Vuetify 3
    entries: [
      './src/**/*.vue'
    ]
  }
})