// server/src/schemas/client.ts
import { z } from 'zod'

export const ClientEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('JOIN_ROOM'),
    roomId: z.string(),
    playerId: z.string(),
    name: z.string().min(1)
  }),
  z.object({
    type: z.literal('ROLL_DICE'),
    playerId: z.string(),
    targetSpaceId: z.number().optional(), // 🧪 Для тестов
  }),
  // ✅ Добавленные типы
  z.object({
    type: z.literal('BUY_PROPERTY'),
    spaceId: z.number()
  }),
  z.object({
    type: z.literal('PASS_ACTION')
  }),
])

export type ClientEvent = z.infer<typeof ClientEventSchema>