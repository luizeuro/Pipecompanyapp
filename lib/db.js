// Acesso ao banco. Em produção é sempre o Supabase, só a partir do backend.
// Rodando local sem SUPABASE_URL, cai num banco em memória com dados de
// demonstração — assim dá pra mexer na interface sem credencial nenhuma.
//
// Duas formas de autenticar no Supabase (qualquer uma serve):
// 1. SUPABASE_SERVICE_ROLE_KEY: chave de administrador, ignora o RLS.
// 2. SUPABASE_PUBLISHABLE_KEY (ou SUPABASE_ANON_KEY) + SUPABASE_BACKEND_SECRET:
//    a chave pública sozinha não lê nada (RLS sem policy para ela); as policies
//    de supabase/migrations/002_backend_access.sql só liberam as tabelas quando
//    a requisição traz o header x-pipe-backend-secret com o segredo guardado no
//    schema privado do banco. Foi a forma usada no setup automatizado, porque o
//    conector do Supabase não entrega a service role key.
import { createClient } from '@supabase/supabase-js'
import { createMemoryDb } from './memoryDb.js'
import { httpError, isProduction } from './util.js'

export const BACKEND_SECRET_HEADER = 'x-pipe-backend-secret'

let cached = null

function supabaseCredentials() {
  const url = process.env.SUPABASE_URL
  if (!url) return null
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { url, key: process.env.SUPABASE_SERVICE_ROLE_KEY, mode: 'service_role', headers: {} }
  }
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY
  if (publicKey && process.env.SUPABASE_BACKEND_SECRET) {
    return {
      url,
      key: publicKey,
      mode: 'backend_secret',
      headers: { [BACKEND_SECRET_HEADER]: process.env.SUPABASE_BACKEND_SECRET },
    }
  }
  return null
}

export function dbMode() {
  if (supabaseCredentials()) return 'supabase'
  if (!isProduction()) return 'memory'
  return 'missing'
}

// 'service_role' | 'backend_secret' | null — usado pra checar o segredo no /api/auth/status.
export function supabaseAuthMode() {
  return supabaseCredentials()?.mode ?? null
}

export function getDb() {
  if (cached) return cached
  const creds = supabaseCredentials()
  if (creds) {
    cached = createClient(creds.url, creds.key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: creds.headers },
    })
  } else if (!isProduction()) {
    console.warn('[db] SUPABASE_URL ausente: usando banco em memória com dados de demonstração.')
    cached = createMemoryDb({ seed: process.env.DEV_SEED !== '0' })
  } else {
    throw httpError(
      503,
      'Banco de dados não configurado: defina SUPABASE_URL e a chave do Supabase nas variáveis de ambiente da Vercel.',
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
      'As tabelas ainda não existem no Supabase: rode os arquivos de supabase/migrations no SQL Editor.',
      'DB_NOT_MIGRATED',
    )
  }
  if (error.code === '23505') throw httpError(409, 'Já existe um registro com esse valor.', 'DUPLICATE')
  // ID malformado na URL (ex: /clientes/abc) não é erro do servidor.
  if (error.code === '22P02') throw httpError(400, 'Identificador inválido.', 'INVALID_ID')
  // RLS barrou: no modo "segredo do backend", é o segredo que não confere.
  if (error.code === '42501') {
    throw httpError(503, 'O banco recusou o acesso: confira SUPABASE_BACKEND_SECRET na Vercel.', 'DB_SECRET_MISMATCH')
  }
  const err = httpError(500, error.message || 'Erro no banco de dados', error.code)
  // Mensagem crua do Postgres vai só pro log da Vercel, não pra tela.
  err.expose = false
  err.details = error
  throw err
}
