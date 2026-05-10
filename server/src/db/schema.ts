// server/src/db/schema.ts
import { pgTable, uuid, varchar, integer, text, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core'

// ENUM для статусов игры
export const gameStatusEnum = pgEnum('game_status', ['lobby', 'playing', 'finished'])
export const playerResultEnum = pgEnum('player_result', ['win', 'loss', 'bankrupt'])

// 👥 Пользователи
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 50 }).unique().notNull(),
  email: varchar('email', { length: 255 }).unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  rating: integer('rating').default(1500),
  wins: integer('wins').default(0),
  losses: integer('losses').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// 🎮 Игры
export const games = pgTable('games', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomCode: varchar('room_code', { length: 20 }).unique().notNull(),
  status: gameStatusEnum('status'),
  winnerId: uuid('winner_id').references(() => users.id, { onDelete: 'set null' }),
  startedAt: timestamp('started_at'),
  finishedAt: timestamp('finished_at'),
  createdAt: timestamp('created_at').defaultNow(),
})

// 👥 Участники игр
export const gamePlayers = pgTable('game_players', {
  gameId: uuid('game_id').references(() => games.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  playerColor: varchar('player_color', { length: 20 }),
  finalPosition: integer('final_position'),
  finalMoney: integer('final_money'),
  result: playerResultEnum('result'),
  joinedAt: timestamp('joined_at').defaultNow(),
}, (t) => ({
  pk: { columns: [t.gameId, t.userId], name: 'game_players_pkey' },
}))

// 📊 События игры
export const gameEvents = pgTable('game_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id').references(() => games.id, { onDelete: 'cascade' }).notNull(),
  playerId: uuid('player_id').references(() => users.id, { onDelete: 'set null' }),
  eventType: varchar('event_type', { length: 50 }).notNull(),
  eventData: jsonb('event_data'),
  occurredAt: timestamp('occurred_at').defaultNow(),
})

// Типы для TypeScript
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Game = typeof games.$inferSelect
export type GamePlayer = typeof gamePlayers.$inferSelect