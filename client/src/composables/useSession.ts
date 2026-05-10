// client/src/composables/useSession.ts
import { ref } from 'vue'

export function useSession() {
  // 🔑 Загружаем СИНХРОННО. myId будет доступен сразу при монтировании компонента
  const myId = ref<string | null>(
    localStorage.getItem('monopoly_player_id') || `p_${Math.random().toString(36).slice(2, 8)}`
  )
  const myName = ref<string>(localStorage.getItem('monopoly_username') || '')

  const save = (id: string, name: string) => {
    localStorage.setItem('monopoly_player_id', id)
    localStorage.setItem('monopoly_username', name)
    myId.value = id
    myName.value = name
  }

  return { myId, myName, save }
}