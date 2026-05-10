import { Room, type RoomState } from './Room'
import type { WebSocket } from 'ws'
import { getRoomState, saveRoomState } from '../lib/redis'

export type RoomView = { sockets: Map<string, WebSocket>; state: RoomState }

export class RoomManager {
  private activeRooms = new Map<string, Room>()

  async getOrCreateRoom(roomId: string): Promise<Room> {
    if (this.activeRooms.has(roomId)) {
      return this.activeRooms.get(roomId)!
    }
    console.log(`🏗 [ROOM] Создаю новую комнату: ${roomId}`)
    const savedState = await getRoomState(roomId)
    const room = new Room(roomId, savedState || undefined)
    this.activeRooms.set(roomId, room)
    return room
  }

  getRoom(roomId: string): Room | undefined {
    return this.activeRooms.get(roomId)
  }

  async syncRoom(roomId: string): Promise<void> {
    const room = this.activeRooms.get(roomId)
    if (room) await saveRoomState(roomId, room.state)
  }

  // 🔑 Ключевой метод: возвращает карту { roomId -> { sockets, state } }
  getAllRoomViews(): Map<string, RoomView> {
    const views = new Map<string, RoomView>()
    for (const [id, room] of this.activeRooms) {
      views.set(id, { sockets: room.getSockets(), state: room.state })
    }
    return views
  }
}