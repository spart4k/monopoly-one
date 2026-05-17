import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('💥 [DB] DATABASE_URL is not set in .env!')
  process.exit(1)
}

const pool = new Pool({ connectionString })

pool.connect()
  .then(client => {
    console.log('🐘 [DB] Connected to PostgreSQL')
    client.release()
  })
  .catch(err => {
    console.error('💥 [DB] Connection failed:', err.message)
    process.exit(1)
  })

export async function query(text: string, params?: any[]) {
  return await pool.query(text, params)
}

export async function getUserByEmail(email: string) {
  const res = await query('SELECT * FROM users WHERE email = $1', [email])
  return res.rows[0] || null
}

export async function getUserById(id: string) {
  const res = await query('SELECT id, email, nickname, role, is_banned, created_at, last_login FROM users WHERE id = $1', [id])
  return res.rows[0] || null
}

export async function createUser(email: string, nickname: string, passwordHash: string) {
  const res = await query(
    'INSERT INTO users (email, nickname, password_hash) VALUES ($1, $2, $3) RETURNING id, email, nickname, role, created_at',
    [email, nickname, passwordHash]
  )
  return res.rows[0]
}

export async function updateLastLogin(userId: string) {
  await query('UPDATE users SET last_login = NOW() WHERE id = $1', [userId])
}

// 🔹 GAME PERSISTENCE
export async function saveGameStart(roomId: string, hostId?: string) {
  return query(
    `INSERT INTO games (room_id, host_id, status) VALUES ($1, $2, 'PLAYING') RETURNING id`,
    [roomId, hostId]
  )
}

export async function saveGameSnapshot(roomId: string, state: any) {
  const gameRes = await query(`SELECT id FROM games WHERE room_id = $1`, [roomId])
  if (!gameRes.rows[0]) return
  return query(
    `INSERT INTO game_snapshots (game_id, snapshot_data) VALUES ($1, $2)`,
    [gameRes.rows[0].id, JSON.stringify(state)]
  )
}

export async function logGameEvent(roomId: string, playerId: string, type: string, data: any = {}) {
  const gameRes = await query(`SELECT id FROM games WHERE room_id = $1`, [roomId])
  if (!gameRes.rows[0]) return
  return query(
    `INSERT INTO game_events (game_id, player_id, event_type, event_data) VALUES ($1, $2, $3, $4)`,
    [gameRes.rows[0].id, playerId, type, JSON.stringify(data)]
  )
}

// server/src/lib/db.ts

export async function saveGameEnd(roomId: string, winnerId: string | null, finalState: any) {
  // 1. Завершаем игру
  const gameRes = await query(
    `UPDATE games SET status = 'ENDED', ended_at = NOW(), winner_id = $2, final_state = $3, duration = NOW() - started_at WHERE room_id = $1 RETURNING id`,
    [roomId, winnerId, JSON.stringify(finalState)]
  )

  // 2. 🔑 ОБНОВЛЯЕМ СТАТИСТИКУ ИГРОКОВ
  if (finalState?.players) {
    for (const p of finalState.players) {
      const isWinner = p.id === winnerId

      // Увеличиваем сыгранные матчи
      await query(`UPDATE users SET games_played = games_played + 1 WHERE id = $1`, [p.id])

      if (isWinner) {
        // Победа: +1 win, +15 rating
        await query(`UPDATE users SET wins = wins + 1, rating = rating + 15 WHERE id = $1`, [p.id])
      } else {
        // Поражение: +1 loss, -10 rating
        await query(`UPDATE users SET losses = losses + 1, rating = GREATEST(rating - 10, 0) WHERE id = $1`, [p.id])
      }
    }
  }

  return gameRes.rows[0]
}

export { pool }