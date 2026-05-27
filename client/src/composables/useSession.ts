// client/src/composables/useSession.ts
import { ref, onUnmounted  } from 'vue'

// 🔹 Простое хранилище сессии без JWT
export const myId = ref<string | null>(null)
export const roomId = ref<string | null>(null)
export const playerName = ref<string>('')

export function useSession() {
  // 🔹 Загрузка из sessionStorage при старте
  const loadSession = () => {
    if (typeof window === 'undefined') return
    myId.value = sessionStorage.getItem('monopoly_playerId') || null
    roomId.value = sessionStorage.getItem('monopoly_roomId') || null
    playerName.value = sessionStorage.getItem('monopoly_playerName') || ''
  }

  // 🔹 Сохранение в sessionStorage
  const saveSession = (id?: string, room?: string, name?: string) => {
    if (typeof window === 'undefined') return
    if (id) {
      sessionStorage.setItem('monopoly_playerId', id)
      myId.value = id
    }
    if (room) {
      sessionStorage.setItem('monopoly_roomId', room)
      roomId.value = room
    }
    if (name) {
      sessionStorage.setItem('monopoly_playerName', name)
      playerName.value = name
    }
  }

  // 🔹 Очистка сессии (выход)
  const clearSession = () => {
    if (typeof window === 'undefined') return
    sessionStorage.removeItem('monopoly_playerId')
    sessionStorage.removeItem('monopoly_roomId')
    // playerName оставляем, чтобы пользователь не вводил ник заново
    myId.value = null
    roomId.value = null
  }

  // 🔹 Установка имени игрока
  const setPlayerName = (name: string) => {
    playerName.value = name
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('monopoly_playerName', name)
    }
  }

  // 🔹 Гарантирует, что сессия загружена (вызывать в onMounted)
  const ensureSession = () => {
    loadSession()
  }

  // 🔹 Авто-загрузка при изменении окна (для вкладок)
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', loadSession)
    onUnmounted(() => window.removeEventListener('storage', loadSession))
  }

  return {
    myId,
    roomId,
    playerName,
    loadSession,
    saveSession,
    clearSession,
    setPlayerName,
    ensureSession
  }
}