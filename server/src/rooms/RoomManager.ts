// server/src/rooms/RoomManager.ts
import { Room } from './Room'
import type { RoomView } from './Room'

export class RoomManager {
  public activeRooms = new Map<string, Room>()

  getRoom(id: string): Room | undefined {
    return this.activeRooms.get(id)
  }

  async getOrCreateRoom(id: string): Promise<Room> {
    let room = this.activeRooms.get(id)
    if (!room) {
      room = new Room(id)
      this.activeRooms.set(id, room)
      console.log(`🏗 [ROOM] Created new room: ${id}`)
    }
    return room
  }

  getAllRoomViews(): Map<string, RoomView> {
    const views = new Map<string, RoomView>()
    for (const [id, room] of this.activeRooms) {
      views.set(id, {
        id,
        state: room.state,
        sockets: room.getSockets()
      })
    }
    return views
  }

  // 🔹 НОВЫЙ: Удаление комнаты
  removeRoom(roomId: string): boolean {
    const room = this.activeRooms.get(roomId)
    if (!room) return false

    // Закрываем сокеты
    for (const [pid, socket] of room.sockets) {
      if (socket.readyState === 1) socket.close()
    }

    const deleted = this.activeRooms.delete(roomId)
    console.log(`🗑 [ROOM] Removed room: ${roomId}, success: ${deleted}`)
    return deleted
  }
}