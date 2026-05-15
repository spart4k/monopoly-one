<!-- admin/src/views/Dashboard.vue -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
import { token } from '../composables/useAuth'

const tab = ref(0)
const users = ref<any[]>([])
const liveRooms = ref<any[]>([])
const historyGames = ref<any[]>([])
const selectedRoomLogs = ref<any[]>([])
const showLogsDialog = ref(false)
const selectedGameTitle = ref('')

let refreshInterval: number

const fetchAll = async () => {
  const headers = { params: { token: token.value } }
  try {
    const [u, live, hist] = await Promise.all([
      axios.get('/admin/users', headers),
      axios.get('/admin/games/live', headers),
      axios.get('/admin/games/history', headers)
    ])
    users.value = u.data
    liveRooms.value = live.data
    historyGames.value = hist.data.map((g: any) => ({
      ...g,
      // 🔹 Парсим даты корректно (с учётом таймзоны)
      started_at: g.started_at ? new Date(g.started_at) : null,
      ended_at: g.ended_at ? new Date(g.ended_at) : null,
      // 🔹 Извлекаем логи из final_state (если игра завершена)
      logs: g.final_state?.logs || []
    }))
  } catch (e) {
    console.error('❌ Admin fetch error:', e)
  }
}

const viewLogs = (game: any) => {
  selectedGameTitle.value = `📜 Логи: ${game.room_id}`
  selectedRoomLogs.value = game.logs || []
  showLogsDialog.value = true
}

const formatDate = (date: Date | null) => {
  if (!date || isNaN(date.getTime())) return '-'
  return date.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

const formatDuration = (start: Date | null, end: Date | null) => {
  if (!start || !end) return '-'
  const diff = end.getTime() - start.getTime()
  const mins = Math.floor(diff / 60000)
  const secs = Math.floor((diff % 60000) / 1000)
  return mins > 0 ? `${mins}м ${secs}с` : `${secs}с`
}

onMounted(() => {
  fetchAll()
  refreshInterval = setInterval(fetchAll, 10000) as any
})
onUnmounted(() => clearInterval(refreshInterval))
</script>

<template>
  <v-container fluid class="pa-4">
    <h2 class="text-h5 font-weight-bold mb-4">📊 Админ-панель</h2>

    <v-tabs v-model="tab" class="mb-4" bg-color="primary">
      <v-tab>👥 Пользователи</v-tab>
      <v-tab>🟢 Live-матчи</v-tab>
      <v-tab>📜 История</v-tab>
    </v-tabs>

    <v-window v-model="tab">
      <!-- 👥 Пользователи -->
      <v-window-item>
        <v-data-table :headers="[{title:'Email',key:'email'},{title:'Ник',key:'nickname'},{title:'Роль',key:'role'},{title:'Действия',key:'actions'}]" :items="users" density="compact">
          <template v-slot:item.role="{ item }">
            <v-chip :color="item.role==='admin'?'red':'blue'" size="small">{{ item.role }}</v-chip>
          </template>
          <template v-slot:item.actions="{ item }">
            <v-btn size="small" color="warning" v-if="!item.is_banned" @click="axios.post(`/admin/ban/${item.id}`, null, {params:{token}})">Бан</v-btn>
            <span v-else class="text-grey text-xs">Забанен</span>
          </template>
        </v-data-table>
      </v-window-item>

      <!-- 🟢 Live-матчи -->
      <v-window-item>
        <v-data-table :headers="[{title:'ID',key:'id'},{title:'Игроки',key:'players'},{title:'Ход',key:'currentTurn'},{title:'Статус',key:'status'},{title:'Действия',key:'actions'}]" :items="liveRooms" density="compact">
          <template v-slot:item.players="{ item }">
            <span class="text-xs">{{ item.players.map((p:any)=>p.name).join(', ') }}</span>
          </template>
          <template v-slot:item.actions="{ item }">
            <v-btn size="small" color="info" @click="viewLogs(item)">📋 Логи</v-btn>
          </template>
        </v-data-table>
      </v-window-item>

      <!-- 📜 История матчей -->
      <v-window-item>
        <v-data-table
            :headers="[
            {title:'Комната',key:'room_id'},
            {title:'Статус',key:'status'},
            {title:'Победитель',key:'winner_id'},
            {title:'Начало',key:'started_at'},
            {title:'Длительность',key:'duration'},
            {title:'Действия',key:'actions'}
          ]"
            :items="historyGames"
            density="compact"
        >
          <template v-slot:item.started_at="{ item }">
            {{ formatDate(item.started_at) }}
          </template>
          <template v-slot:item.duration="{ item }">
            {{ formatDuration(item.started_at, item.ended_at) }}
          </template>
          <template v-slot:item.actions="{ item }">
            <v-btn size="small" color="info" @click="viewLogs(item)" :disabled="!item.logs?.length">
              📋 Логи
            </v-btn>
          </template>
        </v-data-table>
      </v-window-item>
    </v-window>

    <!-- 📋 Диалог просмотра логов -->
    <v-dialog v-model="showLogsDialog" max-width="700" scrollable>
      <v-card>
        <v-card-title class="text-h6 px-4 pt-4">{{ selectedGameTitle }}</v-card-title>
        <v-card-text class="pa-0">
          <v-list density="compact" class="overflow-y-auto" style="max-height: 500px">
            <v-list-item
                v-for="(log, i) in selectedRoomLogs"
                :key="i"
                :title="log"
                density="compact"
                class="text-xs font-mono border-b border-gray-700"
            ></v-list-item>
            <v-list-item v-if="!selectedRoomLogs.length" title="Нет логов" class="text-gray-500"></v-list-item>
          </v-list>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="showLogsDialog=false">Закрыть</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>