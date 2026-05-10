import { z } from 'zod'

// 📤 Клиент → Сервер
export const ClientEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('JOIN_ROOM'),
    roomId: z.string(),
    playerId: z.string(),
    name: z.string().min(1),
  }),
  z.object({
    type: z.literal('ROLL_DICE'),
    playerId: z.string(),
    targetSpaceId: z.number().optional(), // 🧪 Для тестов
  }),
  // ✅ Новые события для покупки/пропуска
  z.object({
    type: z.literal('BUY_PROPERTY'),
    spaceId: z.number(),
  }),
  z.object({
    type: z.literal('PASS_ACTION'),
  }),
  z.object({ type: z.literal('PAY_JAIL_FINE'), playerId: z.string() }),
  z.object({ type: z.literal('USE_JAIL_CARD'), playerId: z.string() }),
])

export type ClientEvent = z.infer<typeof ClientEventSchema>

// 📥 Сервер → Клиент
export const ServerEventSchema = z.discriminatedUnion('type', [
  // SYNC_STATE
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
        properties: z.array(z.number()),
      })),
      currentTurn: z.string(),
      logs: z.array(z.string()),
      lastDice: z.tuple([z.number(), z.number()]).optional(),
    }),
  }),
  z.object({
    type: z.literal('ACTION_REQUIRED'),
    title: z.string(),
    message: z.string(),
    icon: z.string()
  }),
  // Движение фишки
  z.object({
    type: z.literal('PLAYER_MOVED'),
    playerId: z.string(),
    from: z.number(),
    to: z.number(),
    dice: z.tuple([z.number(), z.number()]),
  }),
  z.object({ type: z.literal('DOUBLE_ROLLED'), playerId: z.string() }),
  // ✅ Предложение купить
  z.object({
    type: z.literal('OFFER_BUY'),
    spaceId: z.number(),
    price: z.number(),
    name: z.string(),
  }),
  // ✅ Карта Шанс/Казна
  z.object({
    type: z.literal('DRAW_CARD'),
    spaceId: z.number(),
    cardType: z.enum(['chance', 'community']),
  }),
  // ✅ Аренда / Налог / Бонусы
  z.object({ type: z.literal('RENT_PAID'), amount: z.number() }),
  z.object({ type: z.literal('TAX_PAID'), amount: z.number() }),
  z.object({ type: z.literal('COLLECT_GO'), amount: z.number() }),
  z.object({ type: z.literal('GO_TO_JAIL'), playerId: z.string() }),
  // ✅ Ошибки
  z.object({ type: z.literal('ERROR'), message: z.string() }),
  z.object({ type: z.literal('CARD_DRAWN'), cardId: z.string(), text: z.string() }),
])

export type ServerEvent = z.infer<typeof ServerEventSchema>