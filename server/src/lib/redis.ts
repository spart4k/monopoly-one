// server/src/lib/redis.ts
import Redis from 'ioredis'

// 🔐 Парсим конфиг максимально надёжно
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
const redisPassword = process.env.REDIS_PASSWORD

// Если пароль в URL (redis://:password@host:port) — ioredis подхватит его сам
// Если пароль в переменной — передаём явно
const redisOptions: any = {
  maxRetriesPerRequest: 1, // Быстро падаем при ошибке, не виснем
  retryStrategy: () => null, // Отключаем авто-ребезоннект, чтобы не спамить логами
  lazyConnect: true,
  showFriendlyErrorStack: true,
}

if (redisPassword) {
  redisOptions.password = redisPassword
  console.log(`🔐 Redis: using password from env (length: ${redisPassword.length})`)
}

const client = new Redis(redisUrl, redisOptions)

let isConnected = false

export async function initRedis() {
  console.log(`🔌 Redis: attempting to connect to ${redisUrl.replace(/:[^@]+@/, ':***@')}`)

  try {
    await client.connect()
    await client.ping()
    isConnected = true
    console.log('✅ Redis connected & ready')
  } catch (err: any) {
    const code = err?.code || err?.message || 'unknown'
    console.warn(`⚠️ Redis connection failed: ${code}`)

    if (code === 'NOAUTH' || code?.includes('NOAUTH')) {
      console.warn('💡 Подсказка: либо задай REDIS_PASSWORD в .env, либо отключи auth в redis.conf (для локальной разработки)')
    }

    console.warn('🎮 Игра продолжит работу в режиме in-memory (без сохранения между рестартами)')
    isConnected = false
  }

  // Глобальный обработчик ошибок — не даём крашнуть процесс
  client.on('error', (err) => {
    // Игнорируем шум закрытия соединения
    if (err?.message?.includes('ECONNREFUSED') || err?.message?.includes('connect')) return
    console.error('❌ Redis runtime error:', err?.message || err?.code || err)
  })
}

export async function getRoomState(roomId: string) {
  if (!isConnected || client.status !== 'ready') return null
  try {
    const data = await client.get(`room:${roomId}`)
    return data ? JSON.parse(data) : null
  } catch {
    return null
  }
}

export async function saveRoomState(roomId: string, state: any) {
  if (!isConnected || client.status !== 'ready') return
  try {
    await client.set(`room:${roomId}`, JSON.stringify(state), 'EX', 3600)
  } catch {
    // Тихо игнорируем — игра продолжит работать в памяти
  }
}

export async function deleteRoomState(roomId: string) {
  if (!isConnected || client.status !== 'ready') return
  try {
    await client.del(`room:${roomId}`)
  } catch {
    // Игнорируем
  }
}