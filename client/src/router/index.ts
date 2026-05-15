import { createRouter, createWebHistory } from 'vue-router'
import Lobby from '../components/Lobby.vue'
import RoomPage from '../components/RoomPage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Lobby },
    { path: '/room/:roomId', component: RoomPage },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

export default router