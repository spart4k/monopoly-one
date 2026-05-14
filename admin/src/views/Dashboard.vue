<script setup lang="ts">
import { useAdmin } from '../composables/useAdmin'
const { users, games, liveEvents, fetchData, banUser } = useAdmin()
</script>

<template>
  <v-container fluid class="pa-6">
    <h2 class="text-h4 mb-4">📊 Панель администратора</h2>

    <v-row>
      <v-col cols="6">
        <v-card class="pa-4">
          <h3 class="text-h5 mb-2">👥 Пользователи</h3>
          <v-table>
            <thead><tr><th>Email</th><th>Ник</th><th>Роль</th><th>Действия</th></tr></thead>
            <tbody>
            <tr v-for="u in users" :key="u.id">
              <td>{{ u.email }}</td>
              <td>{{ u.nickname }}</td>
              <td><v-chip :color="u.role === 'admin' ? 'red' : 'blue'" size="small">{{ u.role }}</v-chip></td>
              <td>
                <v-btn v-if="!u.is_banned" color="warning" size="small" @click="banUser(u.id)">Бан</v-btn>
                <span v-else class="text-grey">Забанен</span>
              </td>
            </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-col>

      <v-col cols="6">
        <v-card class="pa-4">
          <h3 class="text-h5 mb-2">🎮 Игры</h3>
          <v-list density="compact">
            <v-list-item v-for="g in games" :key="g.id" :title="g.room_id" :subtitle="`Статус: ${g.status} | ${new Date(g.created_at).toLocaleString()}`"></v-list-item>
          </v-list>
        </v-card>
      </v-col>
    </v-row>

    <v-card class="mt-6 pa-4">
      <h3 class="text-h5 mb-2">📡 Live-события</h3>
      <v-list height="300" class="overflow-y-auto">
        <v-list-item v-for="(ev, i) in liveEvents.slice(0, 50)" :key="i" :title="ev.event.type" :subtitle="JSON.stringify(ev.event.data)"></v-list-item>
      </v-list>
    </v-card>
  </v-container>
</template>