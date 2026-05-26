// client/src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router'
import Lobby from '../components/Lobby.vue'
import RoomPage from '../components/RoomPage.vue'
import MonopolyBoard from '../components/MonopolyBoard.vue'

const router = createRouter({
  // 🔹 base должен совпадать с vite.config.ts и началом location в nginx
  history: createWebHistory('/game/'),

  routes: [
    // 🔹 Главная страницы игры (по адресу /game/)
    {
      path: '/',
      component: Lobby,
      name: 'Lobby',
      meta: { title: 'Лобби' }
    },

    // 🔹 Комната игры (/game/room/xxx)
    {
      path: '/room/:roomId',
      component: RoomPage,
      name: 'Room',
      props: true,
      meta: { title: 'Комната' }
    },

    // 🔹 Игровая доска (если нужен отдельный роут)
    {
      path: '/board',
      component: MonopolyBoard,
      name: 'Board',
      meta: { title: 'Игра' }
    },

    // 🔹 Catch-all: любой неизвестный путь внутри /game/ → показываем Лобби
    // ❗ НЕ редиректим на '/', иначе улетим на лендинг!
    {
      path: '/:pathMatch(.*)*',
      component: Lobby,
      name: 'CatchAll'
    }
  ]
})

// 🔹 Опционально: установка заголовка страницы
router.beforeEach((to, from, next) => {
  if (to.meta.title) {
    document.title = `Monopoly — ${to.meta.title}`
  }
  next()
})

export default router