// client/src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router'
import Lobby from '../components/Lobby.vue'
import RoomPage from '../components/RoomPage.vue'
import MonopolyBoard from '../components/MonopolyBoard.vue'

const router = createRouter({
  // 🔹 КРИТИЧНО: base должен совпадать с vite.config.ts и nginx.conf
  history: createWebHistory('/game/'),

  routes: [
    // 🔹 Главная страница игры (по адресу /game/)
    {
      path: '/',
      component: Lobby,
      name: 'Lobby'
    },

    // 🔹 Комната игры (/game/room/xxx)
    {
      path: '/room/:roomId',
      component: RoomPage,
      name: 'Room',
      props: true
    },

    // 🔹 Игровая доска (/game/board) — если используешь отдельный компонент
    {
      path: '/board',
      component: MonopolyBoard,
      name: 'Board'
    },

    // 🔹 Catch-all: любой неизвестный путь внутри /game/ → показываем Лобби
    // (НЕ редиректим на '/', иначе улетим на лендинг!)
    {
      path: '/:pathMatch(.*)*',
      component: Lobby,
      name: 'CatchAll'
    }
  ]
})

export default router