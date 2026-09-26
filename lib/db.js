// Acesso ao banco. Em produção é sempre o Supabase, com a service role key e
// só a partir do backend (as tabelas têm RLS ligado e nenhuma policy, então a
// chave pública do projeto não lê nem grava nada). Rodando local sem
// SUPABASE_URL, cai num banco em memória com dados de demonstração — assim dá
// pra mexer na interface sem credencial nenhuma.
import { createClient } from '@supabase/supabase-js'
import { createMemoryDb } from './memoryDb.js'
import { httpError, isProduction } from './util.js'

let cached = null

export function dbMode() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return 'supabase'
  if (!isProduction()) return 'memory'
  return 'missing'
}

export function getDb() {
  if (cached) return cached
  const mode = dbMode()
  if (mode === 'supabase') {
    cached = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  } else if (mode === 'memory') {
    console.warn('[db] SUPABASE_URL ausente: usando banco em memória com dados de demonstração.')
    cached = createMemoryDb({ seed: process.env.DEV_SEED !== '0' })
  } else {
    throw httpError(
      503,
      'Banco de dados não configurado: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente da Vercel.',
      'DB_NOT_CONFIGURED',
    )
  }
  return cached
}

// Desembrulha o { data, error } do supabase-js e transforma erro em exceção
// legível. Tabela inexistente vira um aviso específico de "rode a migração",
// que é o erro mais comum logo depois de criar o projeto no Supabase.
export function unwrap({ data, error }) {
  if (!error) return data
  if (error.code === 'PGRST205' || error.code === '42P01') {
    throw httpError(
      503,
      'As tabelas ainda não existem no Supabase: rode supabase/migrations/001_init.sql no SQL Editor.',
      'DB_NOT_MIGRATED',
    )
  }
  if (error.code === '23505') throw httpError(409, 'Já existe um registro com esse valor.', 'DUPLICATE')
  // ID malformado na URL (ex: /clientes/abc) não é erro do servidor.
  if (error.code === '22P02') throw httpError(400, 'Identificador inválido.', 'INVALID_ID')
  // RLS barrou: a chave configurada não é a service role (ex: colaram a chave pública).
  if (error.code === '42501') {
    throw httpError(
      503,
      'O banco recusou o acesso: confira se SUPABASE_SERVICE_ROLE_KEY na Vercel é a chave secreta (service role), não a pública.',
      'DB_ACCESS_DENIED',
    )
  }
  const err = httpError(500, error.message || 'Erro no banco de dados', error.code)
  // Mensagem crua do Postgres vai só pro log da Vercel, não pra tela.
  err.expose = false
  err.details = error
  throw err
}
