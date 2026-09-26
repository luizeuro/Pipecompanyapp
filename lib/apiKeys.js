// Chaves de API para agentes (Hermes, n8n...). A chave em texto aparece UMA
// vez, na criação; o banco guarda só o hash SHA-256 — quem conseguir ler o
// banco não consegue usar a chave. Revogar é imediato (checado a cada chamada).
import crypto from 'node:crypto'
import { getDb, unwrap } from './db.js'
import { cleanText, httpError } from './util.js'

const PREFIX = 'pc_live_'
const hashKey = (token) => crypto.createHash('sha256').update(token).digest('hex')

export const isApiKey = (token) => typeof token === 'string' && token.startsWith(PREFIX)

export async function createApiKey({ name, scope }, actor) {
  const label = cleanText(name, 60)
  if (!label) throw httpError(400, 'Dê um nome para a chave (ex: Hermes do Mac).')
  const token = PREFIX + crypto.randomBytes(24).toString('base64url')
  const row = unwrap(
    await getDb()
      .from('api_keys')
      .insert({
        name: label,
        scope: scope === 'read' ? 'read' : 'read_write',
        key_hash: hashKey(token),
        prefix: token.slice(0, PREFIX.length + 4),
        created_by: actor.name,
      })
      .select('id,name,scope,prefix,created_by,created_at')
      .single(),
  )
  return { ...row, token }
}

export async function listApiKeys() {
  return unwrap(
    await getDb()
      .from('api_keys')
      .select('id,name,scope,prefix,created_by,created_at,last_used_at,revoked_at')
      .order('created_at', { ascending: false }),
  )
}

export async function revokeApiKey(id) {
  const row = unwrap(
    await getDb().from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', id).select('id').maybeSingle(),
  )
  if (!row) throw httpError(404, 'Chave não encontrada.')
}

// "Último uso" é informativo: grava no máximo a cada 5 min por chave, pra não
// fazer uma escrita no banco a cada ferramenta que o agente chama.
const lastTouch = new Map()

export async function verifyApiKey(token) {
  const db = getDb()
  const row = unwrap(await db.from('api_keys').select('id,name,scope,revoked_at').eq('key_hash', hashKey(token)).maybeSingle())
  if (!row || row.revoked_at) return null
  const now = Date.now()
  if (now - (lastTouch.get(row.id) || 0) > 5 * 60 * 1000) {
    lastTouch.set(row.id, now)
    await db.from('api_keys').update({ last_used_at: new Date(now).toISOString() }).eq('id', row.id)
  }
  return row
}
