// client/src/composables/useSession.ts
import { ref } from 'vue'

// 🔹 Вспомогательная функция для генерации безопасного ID
const generateId = () => `p_${Math.random().toString(36).slice(2, 9)}`

// 🔹 Безопасное чтение из sessionStorage (фильтруем "null")
const readSafe = (key: string): string | null => {
  const val = sessionStorage.getItem(key)
  return val && val !== 'null' ? val : null
}

// 🔹 Инициализация рефов
export const myId = ref<string | null>(readSafe('monopoly_playerId'))
export const roomId = ref<string | null>(readSafe('monopoly_roomId'))
export const playerName = ref<string | null>(readSafe('monopoly_playerName'))

// 🔹 Гарантированная инициализация (вызывать в onMounted)
export function ensureSession(defaultName?: string) {
  // Если myId нет — генерируем новый
  if (!myId.value) {
    const newId = generateId()
    myId.value = newId
    sessionStorage.setItem('monopoly_playerId', newId)
    console.log(`✅ [SESSION] Generated new myId: ${newId}`)
  }

  // Если имени нет и передано по умолчанию — устанавливаем
  if (!playerName.value && defaultName?.trim()) {
    playerName.value = defaultName.trim()
    sessionStorage.setItem('monopoly_playerName', defaultName.trim())
  }
}

export function useSession() {
  const setSession = (id: string, room: string, name?: string) => {
    if (id && id !== 'null') {
      myId.value = id
      sessionStorage.setItem('monopoly_playerId', id)
    }
    if (room && room !== 'null') {
      roomId.value = room
      sessionStorage.setItem('monopoly_roomId', room)
    }
    if (name && name !== 'null') {
      playerName.value = name
      sessionStorage.setItem('monopoly_playerName', name)
    }
  }

  const clearSession = () => {
    myId.value = null
    roomId.value = null
    playerName.value = null
    sessionStorage.removeItem('monopoly_playerId')
    sessionStorage.removeItem('monopoly_roomId')
    sessionStorage.removeItem('monopoly_playerName')
  }

  return { myId, roomId, playerName, setSession, clearSession, ensureSession }
}