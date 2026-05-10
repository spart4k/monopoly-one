// server/src/db/users.ts
import { eq } from 'drizzle-orm'
import { db, users, type NewUser } from './index'

// Создать нового пользователя
export async function createUser(data: NewUser) {
  const [user] = await db.insert(users).values(data).returning()
  return user
}

// Найти по username
export async function findUserByUsername(username: string) {
  const [user] = await db.select().from(users).where(eq(users.username, username))
  return user || null
}

// Найти по ID
export async function findUserById(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id))
  return user || null
}

// Обновить статистику
export async function updateUserStats(userId: string, stats: { win?: boolean; ratingChange?: number }) {
  const updates: Partial<typeof users.$inferSelect> = {}

  if (stats.win !== undefined) {
    updates.wins = stats.win ? (await findUserById(userId))?.wins! + 1 : undefined
    updates.losses = !stats.win ? (await findUserById(userId))?.losses! + 1 : undefined
  }
  if (stats.ratingChange !== undefined) {
    updates.rating = ((await findUserById(userId))?.rating || 1500) + stats.ratingChange
  }

  if (Object.keys(updates).length > 0) {
    const [updated] = await db.update(users).set(updates).where(eq(users.id, userId)).returning()
    return updated
  }
  return null
}