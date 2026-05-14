// server/src/events/auth.ts
import { createUser, getUserByEmail, updateLastLogin } from '../lib/db'
import { hashPassword, verifyPassword, generateToken } from '../lib/auth'

export async function handleRegister(email: string, nickname: string, password: string) {
  console.log(`🔐 [AUTH] Register attempt: ${email}`)
  if (!email?.includes('@')) return { error: 'Некорректный email' }
  if (!nickname || nickname.length < 3) return { error: 'Никнейм минимум 3 символа' }
  if (!password || password.length < 6) return { error: 'Пароль минимум 6 символов' }

  const existing = await getUserByEmail(email)
  if (existing) {
    console.log(`⚠️ [AUTH] Email already exists: ${email}`)
    return { error: 'Email уже занят' }
  }

  const passwordHash = await hashPassword(password)
  const user = await createUser(email, nickname, passwordHash)
  console.log(`✅ [AUTH] User created: ${user.id}`)

  const token = generateToken(user)
  return {
    success: true,
    user: { id: user.id, email: user.email, nickname: user.nickname, role: user.role },
    token
  }
}

export async function handleLogin(email: string, password: string) {
  console.log(`🔐 [AUTH] Login attempt: ${email}`)

  if (!email || !password) {
    console.log(`❌ [AUTH] Missing email or password`)
    return { error: 'Email и пароль обязательны' }
  }

  const user = await getUserByEmail(email)
  if (!user) {
    console.log(`❌ [AUTH] User not found: ${email}`)
    return { error: 'Неверный email или пароль' }
  }
  console.log(`🔍 [AUTH] User found: ${user.id}, role: ${user.role}, banned: ${user.is_banned}`)

  if (user.is_banned) {
    console.log(`❌ [AUTH] User is banned: ${email}`)
    return { error: 'Аккаунт заблокирован' }
  }

  const valid = await verifyPassword(password, user.password_hash)
  console.log(`🔑 [AUTH] Password valid: ${valid}`)

  if (!valid) {
    console.log(`❌ [AUTH] Wrong password for: ${email}`)
    return { error: 'Неверный email или пароль' }
  }

  await updateLastLogin(user.id)
  const token = generateToken(user)
  console.log(`✅ [AUTH] Login success: ${user.id}, token issued`)

  return {
    success: true,
    user: { id: user.id, email: user.email, nickname: user.nickname, role: user.role },
    token
  }
}