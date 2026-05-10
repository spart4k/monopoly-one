export const CONSTANTS = {
  COLORS: ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500'] as const,
  STARTING_MONEY: 1500,
  MAX_LOGS: 100,
  SYNC_LOGS_LIMIT: 50,
  BOARD_SIZE: 40, // ✅ КРИТИЧНО: должно быть 40, не 0 и не undefined
} as const

export type ColorClass = typeof CONSTANTS.COLORS[number]