// client/src/main.ts
import { createApp } from 'vue'
import { createPinia } from 'pinia' // 🔑 Обязательно
import App from './App.vue'
import router from './router'
import './style.css'

const app = createApp(App)
const pinia = createPinia()

// 🔑 Порядок важен: сначала Pinia, потом Router
app.use(pinia)
app.use(router)
app.mount('#app')