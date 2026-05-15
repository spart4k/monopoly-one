// server/src/modules/admin/admin.routes.ts
import { FastifyInstance } from 'fastify'
import { query } from '../../lib/db'
import { verifyToken } from '../../lib/auth'

export function registerAdminRoutes(app: FastifyInstance, roomManager: any) {
  const authenticate = async (request: any, reply: any) => {
    const token = request.headers.authorization?.replace('Bearer ', '') || request.query?.token
    if (!token) return reply.status(401).send({ error: 'Unauthorized' })
    const payload = verifyToken(token)
    if (!payload || payload.role !== 'admin') return reply.status(403).send({ error: 'Admin access required' })
    request.user = payload
  }

  app.get('/admin/users', { preHandler: authenticate }, async (req, reply) => {
    const res = await query('SELECT id, email, nickname, role, is_banned, created_at, last_login FROM users ORDER BY created_at DESC')
    return reply.send(res.rows)
  })

  app.get('/admin/games/live', { preHandler: authenticate }, (req, reply) => {
    const liveRooms = []
    for (const [id, room] of roomManager.activeRooms.entries()) {
      liveRooms.push({
        id: room.id, status: room.state.status,
        players: room.state.players.map(p => ({ id: p.id, name: p.name, money: p.money, isBankrupt: p.isBankrupt, isReady: p.isReady })),
        logs: room.state.logs.slice(-50), currentTurn: room.state.currentTurn, actionPending: room.state.actionPending
      })
    }
    return reply.send(liveRooms)
  })

  // 🔹 ИСТОРИЯ: Без JOIN, безопасно для VARCHAR winner_id
  app.get('/admin/games/history', { preHandler: authenticate }, async (req, reply) => {
    const res = await query(`
        SELECT
            id, room_id, status, started_at, ended_at, winner_id,
            duration,
            final_state::json as final_state  -- 🔑 Явное приведение к JSON
        FROM games
        ORDER BY started_at DESC
            LIMIT 50
    `)
    return reply.send(res.rows)
  })

  app.post('/admin/ban/:userId', { preHandler: authenticate }, async (req, reply) => {
    await query('UPDATE users SET is_banned = true WHERE id = $1', [(req.params as any).userId])
    return reply.send({ success: true })
  })
}