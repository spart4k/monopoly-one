// client/src/shared/playerColors.ts
export const PLAYER_COLORS: Record<string, string> = {
  'bg-red-500': '#ef4444',
  'bg-blue-500': '#3b82f6',
  'bg-green-500': '#22c55e',
  'bg-yellow-500': '#eab308',
  'bg-purple-500': '#a855f7',
  'bg-orange-500': '#f97316',
}

export const DEFAULT_COLOR = '#6b7280'

/** Возвращает HEX-цвет по Tailwind-классу игрока */
export function getPlayerColorHex(twClass: string): string {
  return PLAYER_COLORS[twClass] || DEFAULT_COLOR
}