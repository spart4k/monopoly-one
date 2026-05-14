import { FastifyInstance } from 'fastify'
import { query } from '../../lib/db'
import { verifyToken } from '../../lib/auth'

export function registerAdminRoutes(app: FastifyInstance) {
  // 🔹 Fastify preHandler для REST-защиты
  const authenticate = async (request: any, reply: any) => {
    const token = request.headers.authorization?.replace('Bearer ', '') || request.query?.token
    if (!token) return reply.status(401).send({ error: 'Unauthorized' })
    const payload = verifyToken(token)
    if (!payload || payload.role !== 'admin') return reply.status(403).send({ error: 'Admin access required' })
    request.user = payload
  }

  app.get('/admin/users', { preHandler: authenticate }, async (request, reply) => {
    const res = await query('SELECT id, email, nickname, role, is_banned, created_at, last_login FROM users ORDER BY created_at DESC')
    return reply.send(res.rows)
  })

  app.get('/admin/games', { preHandler: authenticate }, async (request, reply) => {
    const res = await query('SELECT id, room_id, status, created_at, ended_at, winner_id FROM games ORDER BY created_at DESC LIMIT 50')
    return reply.send(res.rows)
  })

  app.post('/admin/ban/:userId', { preHandler: authenticate }, async (request, reply) => {
    await query('UPDATE users SET is_banned = true WHERE id = $1', [(request.params as any).userId])
    return reply.send({ success: true })
  })
}