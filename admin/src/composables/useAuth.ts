import { ref } from 'vue'

// 🔑 Глобальные реактивные состояния
export const user = ref<any>(null)
export const token = ref<string | null>(localStorage.getItem('admin_token') || null)
export const error = ref<string | null>(null)
export const loading = ref(false)

export function useAuth() {
  const login = async (email: string, password: string) => {
    loading.value = true
    error.value = null

    return new Promise<boolean>((resolve) => {
      const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3000/ws'
      const ws = new WebSocket(wsUrl)
      let isResolved = false

      ws.onopen = () => {
        console.log('🔌 [AUTH] WS connected, sending LOGIN')
        ws.send(JSON.stringify({ type: 'LOGIN', email, password }))
      }

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          console.log('📥 [AUTH] Received:', data.type)

          if (data.type === 'AUTH_SUCCESS' && !isResolved) {
            isResolved = true
            token.value = data.token
            user.value = data.user
            localStorage.setItem('admin_token', data.token)
            console.log('✅ [AUTH] Logged in successfully')
            ws.close()
            resolve(true)
          } else if (data.type === 'ERROR' && !isResolved) {
            isResolved = true
            error.value = data.message
            console.error('❌ [AUTH] Error:', data.message)
            ws.close()
            resolve(false)
          }
        } catch (err) {
          console.error('💥 [AUTH] Parse error:', err)
        }
      }

      ws.onerror = () => {
        if (!isResolved) {
          isResolved = true
          error.value = 'Ошибка подключения к серверу'
          ws.close()
          resolve(false)
        }
      }

      ws.onclose = () => {
        if (!isResolved) {
          isResolved = true
          error.value = 'Соединение закрыто'
          resolve(false)
        }
      }
    }).finally(() => {
      loading.value = false // 🔑 Гарантированно сбрасываем лоадер
    })
  }

  const logout = () => {
    token.value = null
    user.value = null
    localStorage.removeItem('admin_token')
    error.value = null
  }

  return { user, token, error, loading, login, logout }
}