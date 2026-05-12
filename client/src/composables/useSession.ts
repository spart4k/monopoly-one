// client/src/composables/useSession.ts
import { ref } from 'vue'

const storedId = sessionStorage.getItem('monopoly_playerId')
const storedRoom = sessionStorage.getItem('monopoly_roomId')
const storedName = sessionStorage.getItem('monopoly_playerName') // 🔑 NEW

export const myId = ref<string | null>(storedId)
export const roomId = ref<string | null>(storedRoom)
export const playerName = ref<string | null>(storedName) // 🔑 NEW

export function useSession() {
  const setSession = (id: string, room: string, name?: string) => {
    myId.value = id
    roomId.value = room
    if (name) {
      playerName.value = name
      sessionStorage.setItem('monopoly_playerName', name)
    }
    sessionStorage.setItem('monopoly_playerId', id)
    sessionStorage.setItem('monopoly_roomId', room)
  }

  const clearSession = () => {
    myId.value = null
    roomId.value = null
    playerName.value = null
    sessionStorage.removeItem('monopoly_playerId')
    sessionStorage.removeItem('monopoly_roomId')
    sessionStorage.removeItem('monopoly_playerName')
  }

  return { myId, roomId, playerName, setSession, clearSession }
}