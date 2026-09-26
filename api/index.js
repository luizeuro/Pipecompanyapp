// API do Pipe Company (CRM + monitor de contas): todas as rotas numa função
// serverless só (a Vercel manda qualquer /api/* pra cá, ver vercel.json). Em dev
// local, dev/server.js sobe este mesmo app numa porta.
// As regras do CRM moram em lib/crm.js; aqui ficam só as rotas HTTP, o login,
// o cron e o endpoint MCP que agentes (Hermes) usam.
import express from 'express'
import cookieParser from 'cookie-parser'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { getDb, unwrap, dbMode } from '../lib/db.js'
import {
  requireAuth,
  requireAdmin,
  setSession,
  clearSession,
  hashPassword,
  checkPassword,
  publicUser,
  normalizeEmail,
  validatePassword,
  verifyTurnstile,
  turnstileEnabled,
  loginBlocked,
  registerLoginFail,
  clearLoginFails,
} from '../lib/auth.js'
import { safeEqual } from '../lib/crypto.js'
import { metaConfigured } from '../lib/meta.js'
import { googleConfigured } from '../lib/google.js'
import { runChecks, pruneHistory } from '../lib/checks.js'
import { notifyAfterCheck } from '../lib/notify.js'
import { emailConfigured, sendEmail, renderAlertsEmail } from '../lib/email.js'
import { createApiKey, listApiKeys, revokeApiKey } from '../lib/apiKeys.js'
import { buildMcpServer } from '../lib/mcp.js'
import * as crm from '../lib/crm.js'
import { httpError, cleanText } from '../lib/util.js'

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', true)
app.use(express.json({ limit: '300kb' }))
app.use(cookieParser())
app.use('/api', (req, res, next) => {
  // Dado de cliente nunca deve ficar em cache de navegador/CDN.
  res.set('Cache-Control', 'no-store')
  next()
})

// Quem está agindo, pra gravar em created_by ("Luiz" ou "Hermes (agente)").
const actorOf = (req) => ({ name: req.user.name, scope: req.user.scope })

// ---------------------------------------------------------------------------
// Rotas públicas: saúde, login e cron
// ---------------------------------------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({ ok: true, db: dbMode() })
})

// Diz pra tela de login se ainda não existe nenhum usuário (primeiro acesso).
app.get('/api/auth/status', async (req, res) => {
  const mode = dbMode()
  if (mode === 'missing') {
    return res.status(503).json({
      error: 'Banco de dados não configurado: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY na Vercel.',
      code: 'DB_NOT_CONFIGURED',
    })
  }
  const users = unwrap(await getDb().from('users').select('id').limit(1))
  res.json({ db: mode, needsSetup: users.length === 0, turnstile: turnstileEnabled() })
})

// Cria o primeiro administrador. Só funciona enquanto a tabela users estiver vazia.
app.post('/api/auth/setup', async (req, res) => {
  const db = getDb()
  const existing = unwrap(await db.from('users').select('id').limit(1))
  if (existing.length) throw httpError(403, 'O primeiro acesso já foi criado. Faça login.')
  const name = cleanText(req.body.name, 80)
  const email = normalizeEmail(req.body.email)
  if (!name || !email.includes('@')) throw httpError(400, 'Informe nome e e-mail válidos.')
  validatePassword(req.body.password)
  const user = unwrap(
    await db
      .from('users')
      .insert({ name, email, role: 'admin', password_hash: await hashPassword(req.body.password) })
      .select('id,name,email,role,created_at')
      .single(),
  )
  setSession(res, user)
  res.status(201).json({ user: publicUser(user) })
})

app.post('/api/auth/login', async (req, res) => {
  const ip = req.ip
  if (loginBlocked(ip)) throw httpError(429, 'Muitas tentativas. Espere 15 minutos e tente de novo.')
  if (!(await verifyTurnstile(req.body.turnstileToken, ip))) {
    throw httpError(400, 'Confirme a verificação de segurança e tente de novo.', 'TURNSTILE_FAILED')
  }
  const email = normalizeEmail(req.body.email)
  const user = unwrap(
    await getDb().from('users').select('id,name,email,role,created_at,password_hash').eq('email', email).maybeSingle(),
  )
  const ok = user ? await checkPassword(req.body.password, user.password_hash) : false
  if (!ok) {
    registerLoginFail(ip)
    throw httpError(401, 'E-mail ou senha incorretos.')
  }
  clearLoginFails(ip)
  setSession(res, user)
  res.json({ user: publicUser(user) })
})

app.post('/api/auth/logout', (req, res) => {
  clearSession(res)
  res.json({ ok: true })
})

// Rota do cron: protegida pelo CRON_SECRET, não pela sessão de usuário.
// O Cron da Vercel chama com GET e manda "Authorization: Bearer <CRON_SECRET>"
// sozinho (ver "crons" no vercel.json); POST fica pra disparo manual/externo.
async function cronCheck(req, res) {
  const secret = process.env.CRON_SECRET
  const auth = req.get('authorization') || ''
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) throw httpError(401, 'Não autorizado.')
  const result = await runChecks({ trigger: 'cron' })
  let email
  try {
    email = await notifyAfterCheck(result)
  } catch (err) {
    // Falha no e-mail não pode derrubar a verificação (os dados já foram salvos).
    email = { sent: false, reason: err.message }
  }
  await pruneHistory().catch(() => {})
  const { newAlerts, ...summary } = result
  res.json({ ...summary, email })
}
app.get('/api/cron/check', cronCheck)
app.post('/api/cron/check', cronCheck)

// ---------------------------------------------------------------------------
// Daqui pra baixo: usuário logado (cookie) ou agente (chave de API)
// ---------------------------------------------------------------------------

app.use('/api', requireAuth)

// Agente (chave de API) lê e escreve no CRM, mas nunca apaga nada nem mexe em
// equipe, senha, chaves ou configurações. Chave "só leitura" não escreve.
app.use('/api', (req, res, next) => {
  if (req.user.role !== 'agent') return next()
  const restricted = /^\/api\/(users|api-keys|auth\/password|settings\/test-email|check|clients\/[^/]+\/check)/.test(req.originalUrl)
  if (req.method === 'DELETE' || restricted) {
    return res.status(403).json({ error: 'Agentes não podem apagar nem mexer em equipe, senhas, chaves ou configurações.' })
  }
  if (req.user.scope === 'read' && req.method !== 'GET' && !req.originalUrl.startsWith('/api/mcp')) {
    return res.status(403).json({ error: 'Esta chave de API é só de leitura.' })
  }
  next()
})

app.get('/api/auth/me', (req, res) => {
  res.json({ user: publicUser(req.user) })
})

app.post('/api/auth/password', async (req, res) => {
  const db = getDb()
  const full = unwrap(await db.from('users').select('password_hash').eq('id', req.user.id).single())
  if (!(await checkPassword(req.body.current, full.password_hash))) throw httpError(400, 'Senha atual incorreta.')
  validatePassword(req.body.next)
  unwrap(await db.from('users').update({ password_hash: await hashPassword(req.body.next) }).eq('id', req.user.id))
  res.json({ ok: true })
})

// ----- MCP: ferramentas do CRM para agentes (Hermes Agent, Claude...) -----
// Streamable HTTP sem sessão: cada POST cria o servidor, responde e fecha —
// é o que funciona em função serverless. Resposta em JSON (sem stream SSE).
app.post('/api/mcp', async (req, res) => {
  const server = buildMcpServer(actorOf(req))
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  res.on('close', () => {
    transport.close()
    server.close()
  })
  await server.connect(transport)
  await transport.handleRequest(req, res, req.body)
})
const mcpMethodNotAllowed = (req, res) => res.status(405).json({ error: 'Use POST (servidor MCP sem sessão).' })
app.get('/api/mcp', mcpMethodNotAllowed)
app.delete('/api/mcp', mcpMethodNotAllowed)

// ----- Chaves de API (só administradores) -----

app.get('/api/api-keys', requireAdmin, async (req, res) => {
  res.json({ keys: await listApiKeys() })
})

app.post('/api/api-keys', requireAdmin, async (req, res) => {
  const key = await createApiKey({ name: req.body.name, scope: req.body.scope }, actorOf(req))
  res.status(201).json({ key })
})

app.delete('/api/api-keys/:id', requireAdmin, async (req, res) => {
  await revokeApiKey(req.params.id)
  res.json({ ok: true })
})

// ----- Equipe -----

app.get('/api/users', async (req, res) => {
  const users = unwrap(await getDb().from('users').select('id,name,email,role,created_at').order('name'))
  res.json({ users })
})

app.post('/api/users', requireAdmin, async (req, res) => {
  const name = cleanText(req.body.name, 80)
  const email = normalizeEmail(req.body.email)
  if (!name || !email.includes('@')) throw httpError(400, 'Informe nome e e-mail válidos.')
  validatePassword(req.body.password)
  const role = req.body.role === 'admin' ? 'admin' : 'member'
  try {
    const user = unwrap(
      await getDb()
        .from('users')
        .insert({ name, email, role, password_hash: await hashPassword(req.body.password) })
        .select('id,name,email,role,created_at')
        .single(),
    )
    res.status(201).json({ user })
  } catch (err) {
    if (err.code === 'DUPLICATE') throw httpError(409, 'Já existe alguém da equipe com esse e-mail.')
    throw err
  }
})

app.patch('/api/users/:id', requireAdmin, async (req, res) => {
  const db = getDb()
  const patch = {}
  if ('name' in req.body) patch.name = cleanText(req.body.name, 80)
  if ('role' in req.body) {
    patch.role = req.body.role === 'admin' ? 'admin' : 'member'
    if (patch.role === 'member') {
      const admins = unwrap(await db.from('users').select('id').eq('role', 'admin'))
      if (admins.length === 1 && admins[0].id === req.params.id) throw httpError(400, 'A equipe precisa de pelo menos um administrador.')
    }
  }
  if (typeof req.body.password === 'string' && req.body.password) {
    validatePassword(req.body.password)
    patch.password_hash = await hashPassword(req.body.password)
  }
  const user = unwrap(await db.from('users').update(patch).eq('id', req.params.id).select('id,name,email,role,created_at').maybeSingle())
  if (!user) throw httpError(404, 'Usuário não encontrado.')
  res.json({ user })
})

app.delete('/api/users/:id', requireAdmin, async (req, res) => {
  if (req.params.id === req.user.id) throw httpError(400, 'Você não pode remover o seu próprio acesso.')
  unwrap(await getDb().from('users').delete().eq('id', req.params.id))
  res.json({ ok: true })
})

// ----- Clientes -----

app.get('/api/clients', async (req, res) => {
  res.json({ clients: await crm.listClients() })
})

app.post('/api/clients', async (req, res) => {
  res.status(201).json({ client: await crm.createClient(req.body) })
})

app.get('/api/clients/:id', async (req, res) => {
  res.json(await crm.getClientDetail(req.params.id))
})

app.patch('/api/clients/:id', async (req, res) => {
  res.json({ client: await crm.updateClient(req.params.id, req.body) })
})

app.delete('/api/clients/:id', async (req, res) => {
  await crm.deleteClient(req.params.id)
  res.json({ ok: true })
})

app.post('/api/clients/:id/check', async (req, res) => {
  await crm.getClientOr404(getDb(), req.params.id, 'id')
  const { newAlerts, ...summary } = await runChecks({ clientIds: [req.params.id], trigger: 'manual' })
  res.json({ ...summary, new_alerts: newAlerts.length })
})

// Verificação geral disparada por alguém da equipe (sem e-mail: quem clicou já está vendo a tela).
app.post('/api/check', async (req, res) => {
  const { newAlerts, ...summary } = await runChecks({ trigger: `manual:${req.user.name}` })
  res.json({ ...summary, new_alerts: newAlerts.length })
})

// ----- Otimizações -----

app.get('/api/optimizations', async (req, res) => {
  res.json({ optimizations: await crm.listOptimizations({ clientId: req.query.client_id, limit: Number(req.query.limit) || 300 }) })
})

app.post('/api/optimizations', async (req, res) => {
  res.status(201).json({ optimization: await crm.createOptimization(req.body, actorOf(req)) })
})

app.patch('/api/optimizations/:id', async (req, res) => {
  res.json({ optimization: await crm.updateOptimization(req.params.id, req.body) })
})

app.delete('/api/optimizations/:id', async (req, res) => {
  await crm.deleteOptimization(req.params.id)
  res.json({ ok: true })
})

// ----- Pendências -----

app.get('/api/pendencias', async (req, res) => {
  res.json({ pendencias: await crm.listPendencias({ status: req.query.status, clientId: req.query.client_id }) })
})

app.post('/api/pendencias', async (req, res) => {
  res.status(201).json({ pendencia: await crm.createPendencia(req.body, actorOf(req)) })
})

app.patch('/api/pendencias/:id', async (req, res) => {
  res.json({ pendencia: await crm.updatePendencia(req.params.id, req.body) })
})

app.delete('/api/pendencias/:id', async (req, res) => {
  await crm.deletePendencia(req.params.id)
  res.json({ ok: true })
})

// ----- Contatos do cliente -----

app.post('/api/contacts', async (req, res) => {
  res.status(201).json({ contact: await crm.createContact(req.body) })
})

app.patch('/api/contacts/:id', async (req, res) => {
  res.json({ contact: await crm.updateContact(req.params.id, req.body) })
})

app.delete('/api/contacts/:id', async (req, res) => {
  await crm.deleteContact(req.params.id)
  res.json({ ok: true })
})

// ----- Funil comercial -----

app.get('/api/leads', async (req, res) => {
  res.json({ leads: await crm.listLeads() })
})

app.get('/api/leads/:id', async (req, res) => {
  res.json(await crm.getLead(req.params.id))
})

app.post('/api/leads', async (req, res) => {
  res.status(201).json({ lead: await crm.createLead(req.body, actorOf(req)) })
})

app.patch('/api/leads/:id', async (req, res) => {
  res.json({ lead: await crm.updateLead(req.params.id, req.body) })
})

app.delete('/api/leads/:id', async (req, res) => {
  await crm.deleteLead(req.params.id)
  res.json({ ok: true })
})

// Fechou: cria o cliente com o que o funil já sabe e leva o histórico junto.
app.post('/api/leads/:id/win', async (req, res) => {
  if (req.user.role === 'agent') throw httpError(403, 'Fechar contrato é só pela equipe, na tela do funil.')
  const { created, ...result } = await crm.winLead(req.params.id)
  res.status(created ? 201 : 200).json(result)
})

// ----- Linha do tempo -----

app.post('/api/interactions', async (req, res) => {
  res.status(201).json({ interaction: await crm.createInteraction(req.body, actorOf(req)) })
})

app.patch('/api/interactions/:id', async (req, res) => {
  res.json({ interaction: await crm.updateInteraction(req.params.id, req.body) })
})

app.delete('/api/interactions/:id', async (req, res) => {
  await crm.deleteInteraction(req.params.id)
  res.json({ ok: true })
})

// ----- Hoje, relatórios e números -----

app.get('/api/today', async (req, res) => {
  res.json(await crm.getToday())
})

app.get('/api/reports', async (req, res) => {
  res.json({ reports: await crm.listReports({ clientId: req.query.client_id, kind: req.query.kind, limit: Number(req.query.limit) || 100 }) })
})

app.post('/api/reports', async (req, res) => {
  res.status(201).json({ report: await crm.createReport(req.body, actorOf(req)) })
})

app.delete('/api/reports/:id', async (req, res) => {
  await crm.deleteReport(req.params.id)
  res.json({ ok: true })
})

app.get('/api/metrics', async (req, res) => {
  res.json(await crm.getMetrics())
})

// ----- Alertas -----

app.get('/api/alerts', async (req, res) => {
  const db = getDb()
  const limit = Math.min(Number(req.query.limit) || 300, 1000)
  let query = db.from('alerts').select('*').order('created_at', { ascending: false }).limit(limit)
  if (req.query.status === 'open') query = query.is('resolved_at', null)
  if (req.query.status === 'resolved') query = query.not('resolved_at', 'is', null)
  if (req.query.client_id) query = query.eq('client_id', req.query.client_id)
  const [rows, names] = await Promise.all([query.then(unwrap), crm.clientNames(db)])
  res.json({ alerts: rows.map((a) => ({ ...a, client_name: names.get(a.client_id) || '—' })) })
})

app.post('/api/alerts/:id/resolve', async (req, res) => {
  const nowIso = new Date().toISOString()
  const row = unwrap(
    await getDb()
      .from('alerts')
      .update({ resolved_at: nowIso, resolved_by: req.user.name, updated_at: nowIso })
      .eq('id', req.params.id)
      .select('*')
      .maybeSingle(),
  )
  if (!row) throw httpError(404, 'Alerta não encontrado.')
  res.json({ alert: row })
})

// ----- Configurações -----

// Só booleanos: a tela mostra O QUE está configurado, nunca os valores.
app.get('/api/settings/status', async (req, res) => {
  const db = getDb()
  const state = unwrap(await db.from('app_state').select('key,value').in('key', ['last_check', 'last_digest']))
  const byKey = Object.fromEntries(state.map((s) => [s.key, s.value]))
  res.json({
    db: dbMode(),
    integrations: {
      meta: metaConfigured(),
      google: googleConfigured(),
      email: emailConfigured(),
      turnstile: turnstileEnabled(),
      cron: Boolean(process.env.CRON_SECRET),
      encryption: Boolean(process.env.ENCRYPTION_KEY),
    },
    schedule: {
      timezone: process.env.CHECK_TIMEZONE || 'America/Sao_Paulo',
      digest_hour: process.env.CHECK_HOUR || '09:00',
    },
    last_check: byKey.last_check || null,
    last_digest: byKey.last_digest || null,
  })
})

app.post('/api/settings/test-email', requireAdmin, async (req, res) => {
  await sendEmail({
    subject: 'Teste do Pipe Company Ads Monitor',
    html: renderAlertsEmail({
      title: 'E-mail de teste',
      intro: `Se você recebeu isto, os alertas por e-mail estão funcionando. Enviado por ${req.user.name}.`,
      alerts: [],
      clientsById: new Map(),
    }),
  })
  res.json({ ok: true })
})

// ---------------------------------------------------------------------------

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' })
})

// Handler central: toda rota só faz `throw httpError(...)` e cai aqui.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500
  if (status >= 500) console.error('[api]', req.method, req.path, err)
  if (res.headersSent) return
  res.status(status).json({
    error: status >= 500 && (err.expose === false || !err.code) ? 'Erro interno no servidor. Tente de novo em instantes.' : err.message,
    code: err.code,
  })
})

export default app
