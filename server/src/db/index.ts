// server/src/db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://monopoly:devpass@localhost:5432/monopoly',
})

export const db = drizzle(pool, { schema })

// Проверка подключения
export async function checkConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1')
    console.log('🟢 PostgreSQL connected')
    return true
  } catch (err) {
    console.error('❌ PostgreSQL connection error:', (err as Error).message)
    return false
  }
}