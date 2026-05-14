// client/src/composables/useAuth.ts
import { ref, computed } from 'vue'
import { sendEvent } from '../lib/ws'

export interface User {
  id: string
  email: string
  nickname: string
  role: 'player' | 'admin' | 'moderator'
}

// 🔹 Внутренние приватные refs
const _user = ref<User | null>(null)
const _token = ref<string | null>(null)
const _error = ref<string | null>(null)
const _loading = ref(false)

// 🔹 Восстановление сессии из localStorage
if (typeof window !== 'undefined') {
  const stored = localStorage.getItem('monopoly_auth')
  if (stored) {
    try {
      const { user: u, token: t } = JSON.parse(stored)
      if (u?.id && t) {
        _user.value = u
        _token.value = t
        console.log('🔐 [AUTH] Session restored')
      }
    } catch (e) {
      console.warn('⚠️ [AUTH] Parse error:', e)
      localStorage.removeItem('monopoly_auth')
    }
  }
}

export function useAuth() {
  // 🔹 Публичные computed для гарантированной реактивности
  const user = computed(() => _user.value)
  const token = computed(() => _token.value)
  const error = computed(() => _error.value)
  const loading = computed(() => _loading.value)
  const isAuthenticated = computed(() => !!_user.value && !!_token.value)

  const register = async (email: string, nickname: string, password: string): Promise<boolean> => {
    _error.value = null
    _loading.value = true

    return new Promise((resolve) => {
      const ws = new WebSocket(import.meta.env.VITE_WS_URL || 'ws://localhost:3000/ws')
      let resolved = false

      ws.onopen = () => ws.send(JSON.stringify({ type: 'REGISTER', email, nickname, password }))

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.type === 'AUTH_SUCCESS' && !resolved) {
            resolved = true
            _setAuth(data.user, data.token)
            ws.close()
            resolve(true)
          } else if (data.type === 'ERROR' && !resolved) {
            resolved = true
            _error.value = data.message
            ws.close()
            resolve(false)
          }
        } catch {}
      }

      ws.onerror = () => { if (!resolved) { resolved = true; _error.value = 'Connection failed'; ws.close(); resolve(false) } }
      ws.onclose = () => { if (!resolved) { resolved = true; resolve(false) } }
    }).finally(() => { _loading.value = false })
  }

  const login = async (email: string, password: string): Promise<boolean> => {
    _error.value = null
    _loading.value = true

    return new Promise((resolve) => {
      const ws = new WebSocket(import.meta.env.VITE_WS_URL || 'ws://localhost:3000/ws')
      let resolved = false

      ws.onopen = () => ws.send(JSON.stringify({ type: 'LOGIN', email, password }))

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.type === 'AUTH_SUCCESS' && !resolved) {
            resolved = true
            _setAuth(data.user, data.token)
            ws.close()
            resolve(true)
          } else if (data.type === 'ERROR' && !resolved) {
            resolved = true
            _error.value = data.message
            ws.close()
            resolve(false)
          }
        } catch {}
      }

      ws.onerror = () => { if (!resolved) { resolved = true; _error.value = 'Connection failed'; ws.close(); resolve(false) } }
      ws.onclose = () => { if (!resolved) { resolved = true; resolve(false) } }
    }).finally(() => { _loading.value = false })
  }

  const logout = () => {
    sendEvent({ type: 'LOGOUT' })
    _clearAuth()
  }

  const _setAuth = (u: User, t: string) => {
    _user.value = u
    _token.value = t
    localStorage.setItem('monopoly_auth', JSON.stringify({ user: u, token: t }))
  }

  const _clearAuth = () => {
    _user.value = null
    _token.value = null
    _error.value = null
    localStorage.removeItem('monopoly_auth')
  }

  const withToken = <T extends object>(payload: T) =>
    _token.value ? { ...payload, token: _token.value } : payload

  return {
    user,           // 🔹 computed, не ref — авто-анврап в шаблоне
    token,
    error,
    loading,
    isAuthenticated,
    register,
    login,
    logout,
    withToken
  }
}