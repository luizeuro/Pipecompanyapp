// Login da equipe: senha com bcrypt, sessão num JWT dentro de cookie httpOnly
// (o JavaScript da página nunca enxerga o token), CAPTCHA opcional via
// Cloudflare Turnstile e um freio simples contra tentativa de senha em massa.
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { getDb, unwrap } from './db.js'
import { httpError, isProduction } from './util.js'

export const SESSION_COOKIE = 'pc_session'
const SESSION_DAYS = 7

function jwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET
  if (!isProduction()) return 'pipecompany-dev-only-jwt-secret'
  throw httpError(500, 'JWT_SECRET não configurado nas variáveis de ambiente da Vercel.', 'JWT_SECRET_MISSING')
}

export const hashPassword = (password) => bcrypt.hash(password, 10)
export const checkPassword = (password, hash) => bcrypt.compare(String(password ?? ''), hash || '')

export function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, created_at: u.created_at }
}

export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase()
}

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw httpError(400, 'A senha precisa ter pelo menos 8 caracteres.')
  }
}

export function setSession(res, user) {
  const token = jwt.sign({ sub: user.id }, jwtSecret(), { expiresIn: `${SESSION_DAYS}d` })
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  })
}

export function clearSession(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' })
}

// Confere o cookie E busca o usuário no banco a cada requisição: assim quem
// for removido da equipe (ou perder o papel de admin) perde o acesso na hora,
// sem esperar o token expirar.
export async function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE]
  if (!token) return res.status(401).json({ error: 'Faça login para continuar.' })
  let payload
  try {
    payload = jwt.verify(token, jwtSecret())
  } catch {
    clearSession(res)
    return res.status(401).json({ error: 'Sua sessão expirou. Faça login de novo.' })
  }
  const user = unwrap(
    await getDb().from('users').select('id,name,email,role,created_at').eq('id', payload.sub).maybeSingle(),
  )
  if (!user) {
    clearSession(res)
    return res.status(401).json({ error: 'Usuário não encontrado. Faça login de novo.' })
  }
  req.user = user
  next()
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Só administradores podem fazer isso.' })
  next()
}

export function turnstileEnabled() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY)
}

// Sem TURNSTILE_SECRET_KEY o CAPTCHA fica desligado e o login funciona normal.
export async function verifyTurnstile(token, ip) {
  if (!turnstileEnabled()) return true
  if (!token) return false
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip || '' }),
      signal: AbortSignal.timeout(8000),
    })
    const body = await res.json()
    return Boolean(body.success)
  } catch {
    return false
  }
}

// Freio de tentativas por IP. Em serverless a memória não é compartilhada
// entre instâncias, então é só uma barreira extra — o CAPTCHA é a defesa real.
const attempts = new Map()
const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILS = 8

export function loginBlocked(ip) {
  const entry = attempts.get(ip)
  if (!entry) return false
  if (Date.now() - entry.first > WINDOW_MS) {
    attempts.delete(ip)
    return false
  }
  return entry.count >= MAX_FAILS
}

export function registerLoginFail(ip) {
  const entry = attempts.get(ip)
  if (!entry || Date.now() - entry.first > WINDOW_MS) attempts.set(ip, { first: Date.now(), count: 1 })
  else entry.count++
}

export function clearLoginFails(ip) {
  attempts.delete(ip)
}
