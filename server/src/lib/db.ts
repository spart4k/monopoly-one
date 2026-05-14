// server/src/lib/db.ts
import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('💥 [DB] DATABASE_URL is not set in .env!')
  console.error('Example: postgresql://user:pass@127.0.0.1:5432/dbname')
  process.exit(1)
}

const pool = new Pool({ connectionString })

// 🔹 Тест подключения при старте
pool.connect()
  .then(client => {
    console.log('🐘 [DB] Connected to PostgreSQL')
    client.release()
  })
  .catch(err => {
    console.error('💥 [DB] Connection failed:', err.message)
    if (err.message.includes('password must be a string')) {
      console.error('🔑 Fix: Check DATABASE_URL in .env — password might be undefined or contain unencoded special chars')
      console.error('🔑 Example: postgresql://user:p%40ss%21word@127.0.0.1:5432/db')
    }
    process.exit(1)
  })

export async function query(text: string, params?: any[]) {
  const res = await pool.query(text, params)
  return res
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

export { pool }