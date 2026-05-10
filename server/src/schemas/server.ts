// server/src/schemas/server.ts
import { z } from 'zod'

export const ServerEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('SYNC_STATE'),
    payload: z.object({
      status: z.enum(['LOBBY', 'PLAYING', 'ENDED']),
      players: z.array(z.object({
        id: z.string(),
        name: z.string(),
        color: z.string(),
        pos: z.number(),
        money: z.number(),
      })),
      currentTurn: z.string(),
      logs: z.array(z.string()),
      lastDice: z.tuple([z.number(), z.number()]),
    }),
  }),
  z.object({
    type: z.literal('PLAYER_MOVED'),
    playerId: z.string(),
    from: z.number(),
    to: z.number(),
    dice: z.tuple([z.number(), z.number()]),
  }),
  z.object({
    type: z.literal('ERROR'),
    message: z.string(),
  }),

  z.object({ type: z.literal('LAND_ON_PROPERTY'), spaceId: z.number(), ownerId: z.string().nullable(), rent: z.number() }),
  z.object({ type: z.literal('LAND_ON_TAX'), spaceId: z.number(), amount: z.number() }),
  z.object({ type: z.literal('LAND_ON_CARD'), spaceId: z.number(), cardType: z.enum(['chance', 'community']) }),
  z.object({ type: z.literal('GO_TO_JAIL'), spaceId: z.number() }),
  z.object({ type: z.literal('COLLECT_GO'), amount: z.number() }),
])

export type ServerEvent = z.infer<typeof ServerEventSchema>