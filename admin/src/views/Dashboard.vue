<!-- admin/src/views/Dashboard.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuth, token } from '../composables/useAuth'
import axios from 'axios'

const tab = ref(0)
const users = ref<any[]>([])
const liveRooms = ref<any[]>([])
const historyGames = ref<any[]>([])
const selectedRoomLogs = ref<any[]>([])
const showLogsDialog = ref(false)

const fetchAll = async () => {
  const headers = { params: { token: token.value } }
  const [u, live, hist] = await Promise.all([
    axios.get('/admin/users', headers),
    axios.get('/admin/games/live', headers),
    axios.get('/admin/games/history', headers)
  ])
  users.value = u.data; liveRooms.value = live.data; historyGames.value = hist.data
}

const viewLogs = (room: any) => {
  selectedRoomLogs.value = room.logs || []
  showLogsDialog.value = true
}

onMounted(fetchAll)
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

      <v-window-item>
        <v-data-table :headers="[{title:'ID',key:'id'},{title:'Игроки',key:'players'},{title:'Ход',key:'currentTurn'},{title:'Статус',key:'status'},{title:'Действия',key:'actions'}]" :items="liveRooms" density="compact">
          <template v-slot:item.players="{ item }">
            <span class="text-xs">{{ item.players.map(p=>p.name).join(', ') }}</span>
          </template>
          <template v-slot:item.actions="{ item }">
            <v-btn size="small" color="info" @click="viewLogs(item)">📋 Логи</v-btn>
          </template>
        </v-data-table>
      </v-window-item>

      <v-window-item>
        <v-data-table :headers="[{title:'Комната',key:'room_id'},{title:'Статус',key:'status'},{title:'Победитель',key:'winner_name'},{title:'Начало',key:'started_at'}]" :items="historyGames" density="compact">
          <template v-slot:item.started_at="{ item }">
            {{ new Date(item.started_at).toLocaleString() }}
          </template>
        </v-data-table>
      </v-window-item>
    </v-window>

    <v-dialog v-model="showLogsDialog" max-width="600">
      <v-card>
        <v-card-title class="text-h6 px-4 pt-4">📜 Логи комнаты</v-card-title>
        <v-card-text class="pa-0">
          <v-list density="compact" height="400" class="overflow-y-auto">
            <v-list-item v-for="(log, i) in selectedRoomLogs" :key="i" :title="log" density="compact" class="text-xs font-mono"></v-list-item>
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