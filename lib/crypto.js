// Criptografia dos tokens de acesso guardados no banco (AES-256-GCM).
// Por quê: se alguém conseguir ler o banco, ainda não consegue usar o token
// da Meta de um cliente sem a ENCRYPTION_KEY, que só existe na Vercel.
import crypto from 'node:crypto'
import { httpError, isProduction } from './util.js'

function getKey() {
  const hex = process.env.ENCRYPTION_KEY
  if (hex && /^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, 'hex')
  if (!isProduction()) return crypto.createHash('sha256').update('pipecompany-dev-only-key').digest()
  throw httpError(
    500,
    'ENCRYPTION_KEY ausente ou inválida na Vercel (precisa ter 64 caracteres hexadecimais).',
    'ENCRYPTION_KEY_MISSING',
  )
}

// Formato: v1:<iv>:<tag>:<conteúdo>, tudo em base64.
export function encrypt(plainText) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':')
}

export function decrypt(payload) {
  if (!payload) return null
  const [version, iv, tag, data] = String(payload).split(':')
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Token criptografado em formato desconhecido')
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
}

// Comparação em tempo constante (evita descobrir o segredo medindo o tempo de resposta).
export function safeEqual(a, b) {
  const ba = Buffer.from(String(a ?? ''))
  const bb = Buffer.from(String(b ?? ''))
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}
