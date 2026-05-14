import { ref, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
import { token } from './useAuth'

export function useAdmin() {
  const users = ref<any[]>([])
  const games = ref<any[]>([])
  const liveEvents = ref<any[]>([])
  let ws: WebSocket | null = null

  const fetchData = async () => {
    const [u, g] = await Promise.all([
      axios.get('/admin/users', { params: { token: token.value } }),
      axios.get('/admin/games', { params: { token: token.value } })
    ])
    users.value = u.data; games.value = g.data
  }

  const connectLive = () => {
    ws = new WebSocket(`${import.meta.env.VITE_WS_URL.replace('http', 'ws')}?token=${token.value}`)
    ws.onopen = () => ws?.send(JSON.stringify({ type: 'ADMIN_SUBSCRIBE' }))
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data)
      if (d.type === 'ADMIN_EVENT') liveEvents.value.unshift(d)
    }
  }

  const banUser = async (id: string) => {
    await axios.post(`/admin/ban/${id}`, null, { params: { token: token.value } })
    await fetchData()
  }

  onMounted(() => { if (token.value) { fetchData(); connectLive() } })
  onUnmounted(() => ws?.close())

  return { users, games, liveEvents, fetchData, banUser }
}