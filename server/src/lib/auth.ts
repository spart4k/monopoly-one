import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

const SALT_ROUNDS = 10
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod'

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function generateToken(user: { id: string; email: string; nickname: string; role: string }): string {
  return jwt.sign(
    { userId: user.id, email: user.email, nickname: user.nickname, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  )
}

export function verifyToken(token: string): { userId: string; email: string; nickname: string; role: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as any
  } catch {
    return null
  }
}