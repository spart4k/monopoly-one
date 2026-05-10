// server/src/events/handlers/index.ts
import type { ClientEvent } from '../../schemas/client'
import type { RoomManager } from '../../rooms/RoomManager'
import type { WebSocket } from 'ws'
import { handleJoinRoom } from './joinRoom'
import { handleRollDice } from './rollDice'
import { handleBuyProperty, handlePassAction } from './buyProperty'
import { handlePayJailFine, useJailCard } from './jailAction'

export async function handleEvent(ev: ClientEvent, roomManager: RoomManager, roomId: string, pid: string | null, sock: WebSocket) {
  const room = roomManager.getRoom(roomId)
  if (!room) return { error: 'Комната не найдена' }

  const views = roomManager.getAllRoomViews()
  let result: any

  try {
    switch (ev.type) {
      case 'JOIN_ROOM':
        result = await handleJoinRoom(room, ev.playerId, ev.name, sock, roomManager)
        break
      case 'ROLL_DICE':
        result = handleRollDice(room, pid!, views, ev.targetSpaceId)
        break
      case 'BUY_PROPERTY':
        result = handleBuyProperty(room, pid!, ev.spaceId!, views)
        break
      case 'PASS_ACTION':
        result = handlePassAction(room, pid!, views)
        break
      case 'PAY_JAIL_FINE':
        result = handlePayJailFine(room, pid!, views)
        break
      case 'USE_JAIL_CARD':
        result = useJailCard(room, pid!, views)
        break
      default:
        result = { error: `Неизвестное событие: ${ev.type}` }
    }
  } catch (err: any) {
    console.error(`💥 WS Handler Crash [${ev.type}]:`, err)
    result = { error: 'Серверная ошибка (см. консоль)' }
  }

  // 📤 Отправляем ошибки клиенту
  if (result?.error) {
    sock.send(JSON.stringify({ type: 'ERROR', message: result.error }))
  }

  return result
}