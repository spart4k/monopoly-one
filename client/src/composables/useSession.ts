import { ref, onMounted } from 'vue'

export function useSession() {
  const myId = ref<string | null>(null)
  const myName = ref<string>('')

  const load = () => {
    try {
      const raw = localStorage.getItem('monopoly_session')
      if (raw) {
        const s = JSON.parse(raw)
        myId.value = s.id
        myName.value = s.name || ''
      }
    } catch {}
  }

  const save = (id: string, name: string) => {
    localStorage.setItem('monopoly_session', JSON.stringify({ id, name }))
    myId.value = id
    myName.value = name
  }

  onMounted(load)
  return { myId, myName, save, load }
}