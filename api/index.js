// API do Pipe Company Ads Monitor: todas as rotas numa função serverless só
// (a Vercel manda qualquer /api/* pra cá, ver vercel.json). Em dev local,
// dev/server.js sobe este mesmo app numa porta.
import express from 'express'
import cookieParser from 'cookie-parser'
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
import { encrypt, safeEqual } from '../lib/crypto.js'
import { balanceLevel, worstLevel } from '../lib/balance.js'
import { normalizeMetaAccountId, metaConfigured } from '../lib/meta.js'
import { normalizeGoogleCustomerId, googleConfigured } from '../lib/google.js'
import { runChecks, pruneHistory } from '../lib/checks.js'
import { notifyAfterCheck } from '../lib/notify.js'
import { emailConfigured, sendEmail, renderAlertsEmail } from '../lib/email.js'
import { recalcLastOptimization, recalcLastContact } from '../lib/summary.js'
import { clientHealth } from '../lib/health.js'
import { httpError, cleanText, dateInTz, shiftDate } from '../lib/util.js'

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', true)
app.use(express.json({ limit: '200kb' }))
app.use(cookieParser())
app.use('/api', (req, res, next) => {
  // Dado de cliente nunca deve ficar em cache de navegador/CDN.
  res.set('Cache-Control', 'no-store')
  next()
})

// ---------------------------------------------------------------------------
// Utilitários de rota
// ---------------------------------------------------------------------------

const CLIENT_STATUSES = ['active', 'paused', 'churned']
const RESULT_METRICS = ['auto', 'messages', 'leads', 'purchases']
const OPT_PLATFORMS = ['meta', 'google', 'both', 'other']
const LEAD_STAGES = ['lead', 'meeting', 'proposal', 'negotiation', 'won', 'lost']
const OPEN_STAGES = ['lead', 'meeting', 'proposal', 'negotiation']
const INTERACTION_KINDS = ['meeting', 'call', 'whatsapp', 'email', 'report', 'complaint', 'praise', 'note']
const LINK_KEYS = ['site', 'instagram', 'drive', 'gtm', 'proposta', 'outro']

// "Hoje" no fuso da agência (e não em UTC, que vira o dia às 21h de Brasília).
const todayLocal = () => dateInTz(new Date(), process.env.CHECK_TIMEZONE || 'America/Sao_Paulo')

function toNumber(value, { allowNull = true } = {}) {
  if (value === '' || value == null) return allowNull ? null : 0
  const n = Number(String(value).replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) throw httpError(400, 'Valor numérico inválido.')
  return n
}

function toDateTime(value) {
  if (!value) return new Date().toISOString()
  // "AAAA-MM-DD" vindo do formulário vira meio-dia de Brasília, pra não virar
  // o dia anterior por causa de fuso.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00-03:00`) : new Date(value)
  if (Number.isNaN(d.getTime())) throw httpError(400, 'Data inválida.')
  return d.toISOString()
}

function toDateOnly(value) {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw httpError(400, 'Data inválida.')
  return value
}

function toBool(value) {
  return value === true || value === 'true' || value === 1
}

// Links da ficha: só as chaves conhecidas, texto curto. O formato fica livre
// (URL, @perfil, domínio): a tela monta o endereço na hora de abrir.
function cleanLinks(value) {
  const out = {}
  if (!value || typeof value !== 'object') return out
  for (const key of LINK_KEYS) {
    const v = cleanText(value[key], 500)
    if (v) out[key] = v
  }
  return out
}

// Remove o token criptografado e anexa os níveis de saldo já calculados, pra
// tela e alerta usarem exatamente a mesma régua (lib/balance.js).
function serializeClient(c, extras = {}) {
  const { meta_access_token_enc: tokenEnc, ...rest } = c
  // Cliente pausado/encerrado não tem urgência de saldo (mesma regra dos alertas).
  const level = (s) => (c.status === 'active' ? balanceLevel(s, c.balance_alert_threshold) : 'unknown')
  const metaLevel = c.meta_ad_account_id ? level(c.meta_snapshot) : null
  const googleLevel = c.google_ads_customer_id ? level(c.google_snapshot) : null
  const daysLeft = [c.meta_snapshot, c.google_snapshot]
    .filter((s) => s?.ok && s.days_left != null)
    .map((s) => s.days_left)
  const spend7d = [c.meta_snapshot, c.google_snapshot]
    .filter((s) => s?.ok)
    .reduce((sum, s) => sum + Number(s.spend_7d || 0), 0)
  const balance = worstLevel(metaLevel || 'unknown', googleLevel || 'unknown')
  return {
    ...rest,
    has_meta_token: Boolean(tokenEnc),
    meta_level: metaLevel,
    google_level: googleLevel,
    balance_level: balance,
    min_days_left: daysLeft.length ? Math.min(...daysLeft) : null,
    spend_7d_total: Math.round(spend7d * 100) / 100,
    ...extras,
    // Saúde calculada no backend (lib/health.js) pra lista, ficha e tela Hoje
    // mostrarem exatamente a mesma nota.
    health: clientHealth(c, {
      criticalAlerts: extras.critical_alerts_count || 0,
      openAlerts: extras.open_alerts_count || 0,
      overduePendencias: extras.overdue_pendencias_count || 0,
      balanceLevel: balance,
    }),
  }
}

function clientInput(body, { partial }) {
  const out = {}
  if (!partial || 'name' in body) {
    const name = cleanText(body.name, 120)
    if (!name) throw httpError(400, 'Informe o nome do cliente.')
    out.name = name
  }
  if ('status' in body) {
    if (!CLIENT_STATUSES.includes(body.status)) throw httpError(400, 'Status inválido.')
    out.status = body.status
  }
  if ('tags' in body) {
    out.tags = Array.isArray(body.tags) ? [...new Set(body.tags.map((t) => String(t).slice(0, 40)))].slice(0, 20) : []
  }
  if ('manager' in body) out.manager = cleanText(body.manager, 80)
  if ('notes' in body) out.notes = cleanText(body.notes, 4000)
  if ('meta_ad_account_id' in body) out.meta_ad_account_id = normalizeMetaAccountId(body.meta_ad_account_id)
  if ('google_ads_customer_id' in body) out.google_ads_customer_id = normalizeGoogleCustomerId(body.google_ads_customer_id)
  if ('result_metric' in body) {
    if (!RESULT_METRICS.includes(body.result_metric)) throw httpError(400, 'Métrica de resultado inválida.')
    out.result_metric = body.result_metric
  }
  if ('balance_alert_threshold' in body) out.balance_alert_threshold = toNumber(body.balance_alert_threshold, { allowNull: false })
  if ('monthly_budget' in body) out.monthly_budget = toNumber(body.monthly_budget)
  if ('segment' in body) out.segment = cleanText(body.segment, 80)
  if ('city' in body) out.city = cleanText(body.city, 80)
  if ('fee_monthly' in body) out.fee_monthly = toNumber(body.fee_monthly)
  if ('contract_start' in body) out.contract_start = toDateOnly(body.contract_start)
  if ('renewal_date' in body) out.renewal_date = toDateOnly(body.renewal_date)
  if ('billing_day' in body) {
    const day = body.billing_day === '' || body.billing_day == null ? null : Number(body.billing_day)
    if (day != null && !(Number.isInteger(day) && day >= 1 && day <= 31)) throw httpError(400, 'Dia de cobrança deve ser de 1 a 31.')
    out.billing_day = day
  }
  if ('links' in body) out.links = cleanLinks(body.links)
  if ('access_notes' in body) out.access_notes = cleanText(body.access_notes, 2000)
  if (typeof body.meta_access_token === 'string' && body.meta_access_token.trim()) {
    out.meta_access_token_enc = encrypt(body.meta_access_token.trim())
  }
  if (body.clear_meta_token === true) out.meta_access_token_enc = null
  return out
}

async function getClientOr404(db, id, columns = '*') {
  const client = unwrap(await db.from('clients').select(columns).eq('id', id).maybeSingle())
  if (!client) throw httpError(404, 'Cliente não encontrado.')
  return client
}

async function clientNames(db) {
  const rows = unwrap(await db.from('clients').select('id,name'))
  return new Map(rows.map((r) => [r.id, r.name]))
}

// ---------------------------------------------------------------------------
// Saúde e autenticação (rotas públicas)
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
// Daqui pra baixo: só usuário logado
// ---------------------------------------------------------------------------

app.use('/api', requireAuth)

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
  const user = unwrap(
    await db.from('users').update(patch).eq('id', req.params.id).select('id,name,email,role,created_at').maybeSingle(),
  )
  if (!user) throw httpError(404, 'Usuário não encontrado.')
  res.json({ user })
})

app.delete('/api/users/:id', requireAdmin, async (req, res) => {
  if (req.params.id === req.user.id) throw httpError(400, 'Você não pode remover o seu próprio acesso.')
  unwrap(await getDb().from('users').delete().eq('id', req.params.id))
  res.json({ ok: true })
})

// ----- Clientes -----

// Lista com as contagens calculadas EM LOTE: 3 consultas no total, não 1 por cliente.
app.get('/api/clients', async (req, res) => {
  const db = getDb()
  const [clients, pendencias, alerts] = await Promise.all([
    db.from('clients').select('*').order('name'),
    db.from('pendencias').select('client_id,due_date').eq('status', 'open'),
    db.from('alerts').select('client_id,severity').is('resolved_at', null),
  ]).then((results) => results.map(unwrap))

  const today = todayLocal()
  const pend = new Map()
  for (const p of pendencias) {
    const entry = pend.get(p.client_id) || { open: 0, overdue: 0 }
    entry.open++
    if (p.due_date && p.due_date < today) entry.overdue++
    pend.set(p.client_id, entry)
  }
  const alertCount = new Map()
  for (const a of alerts) {
    const entry = alertCount.get(a.client_id) || { open: 0, critical: 0 }
    entry.open++
    if (a.severity === 'critical') entry.critical++
    alertCount.set(a.client_id, entry)
  }

  res.json({
    clients: clients.map((c) =>
      serializeClient(c, {
        open_pendencias_count: pend.get(c.id)?.open || 0,
        overdue_pendencias_count: pend.get(c.id)?.overdue || 0,
        open_alerts_count: alertCount.get(c.id)?.open || 0,
        critical_alerts_count: alertCount.get(c.id)?.critical || 0,
      }),
    ),
  })
})

app.post('/api/clients', async (req, res) => {
  const input = clientInput(req.body, { partial: false })
  const client = unwrap(await getDb().from('clients').insert(input).select('*').single())
  res.status(201).json({ client: serializeClient(client) })
})

// Detalhe: cliente + histórico de 30 dias + otimizações + pendências + alertas.
app.get('/api/clients/:id', async (req, res) => {
  const db = getDb()
  const client = await getClientOr404(db, req.params.id)
  const since = new Date(Date.now() - 30 * 864e5).toISOString()
  const [snapshots, optimizations, pendencias, alerts, contacts, interactions] = await Promise.all([
    db
      .from('account_snapshots')
      .select('platform,checked_at,ok,balance,spend_today,spend_yesterday,spend_7d,results_7d,active_campaigns')
      .eq('client_id', client.id)
      .gte('checked_at', since)
      .order('checked_at', { ascending: true }),
    db.from('optimizations').select('*').eq('client_id', client.id).order('performed_at', { ascending: false }).limit(200),
    db.from('pendencias').select('*').eq('client_id', client.id).order('created_at', { ascending: false }).limit(200),
    db.from('alerts').select('*').eq('client_id', client.id).order('created_at', { ascending: false }).limit(100),
    db.from('contacts').select('*').eq('client_id', client.id).order('name'),
    db.from('interactions').select('*').eq('client_id', client.id).order('happened_at', { ascending: false }).limit(300),
  ]).then((results) => results.map(unwrap))

  const today = todayLocal()
  const openPend = pendencias.filter((p) => p.status === 'open')
  const openAlerts = alerts.filter((a) => !a.resolved_at)
  res.json({
    client: serializeClient(client, {
      open_pendencias_count: openPend.length,
      overdue_pendencias_count: openPend.filter((p) => p.due_date && p.due_date < today).length,
      open_alerts_count: openAlerts.length,
      critical_alerts_count: openAlerts.filter((a) => a.severity === 'critical').length,
    }),
    snapshots,
    optimizations,
    pendencias,
    alerts,
    contacts,
    interactions,
  })
})

app.patch('/api/clients/:id', async (req, res) => {
  const db = getDb()
  const current = await getClientOr404(db, req.params.id, 'id,status,meta_ad_account_id,google_ads_customer_id')
  const patch = clientInput(req.body, { partial: true })
  // Data do cancelamento alimenta a métrica "cancelamentos no mês".
  if ('status' in patch && patch.status !== current.status) {
    patch.churned_at = patch.status === 'churned' ? new Date().toISOString() : null
  }
  // Trocou/removeu a conta: o snapshot antigo é de outra conta, então descarta.
  // Os alertas dela se resolvem sozinhos na próxima verificação.
  if ('meta_ad_account_id' in patch && patch.meta_ad_account_id !== current.meta_ad_account_id) patch.meta_snapshot = null
  if ('google_ads_customer_id' in patch && patch.google_ads_customer_id !== current.google_ads_customer_id) {
    patch.google_snapshot = null
  }
  patch.updated_at = new Date().toISOString()
  const client = unwrap(await db.from('clients').update(patch).eq('id', req.params.id).select('*').single())
  res.json({ client: serializeClient(client) })
})

app.delete('/api/clients/:id', async (req, res) => {
  const db = getDb()
  await getClientOr404(db, req.params.id, 'id')
  unwrap(await db.from('clients').delete().eq('id', req.params.id))
  res.json({ ok: true })
})

app.post('/api/clients/:id/check', async (req, res) => {
  const db = getDb()
  await getClientOr404(db, req.params.id, 'id')
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
  const db = getDb()
  let query = db.from('optimizations').select('*').order('performed_at', { ascending: false }).limit(Math.min(Number(req.query.limit) || 300, 1000))
  if (req.query.client_id) query = query.eq('client_id', req.query.client_id)
  const [rows, names] = await Promise.all([query.then(unwrap), clientNames(db)])
  res.json({ optimizations: rows.map((o) => ({ ...o, client_name: names.get(o.client_id) || '—' })) })
})

function optimizationInput(body, { partial }) {
  const out = {}
  if (!partial || 'client_id' in body) {
    if (!body.client_id) throw httpError(400, 'Escolha o cliente.')
    out.client_id = String(body.client_id)
  }
  if (!partial || 'description' in body) {
    const description = cleanText(body.description, 4000)
    if (!description) throw httpError(400, 'Descreva o que foi feito.')
    out.description = description
  }
  if ('platform' in body) {
    if (!OPT_PLATFORMS.includes(body.platform)) throw httpError(400, 'Plataforma inválida.')
    out.platform = body.platform
  }
  if ('category' in body) out.category = cleanText(body.category, 40) || 'outro'
  if (!partial || 'performed_at' in body) out.performed_at = toDateTime(body.performed_at)
  return out
}

app.post('/api/optimizations', async (req, res) => {
  const db = getDb()
  const input = optimizationInput(req.body, { partial: false })
  await getClientOr404(db, input.client_id, 'id')
  const row = unwrap(await db.from('optimizations').insert({ ...input, created_by: req.user.name }).select('*').single())
  await recalcLastOptimization(row.client_id)
  res.status(201).json({ optimization: row })
})

app.patch('/api/optimizations/:id', async (req, res) => {
  const db = getDb()
  const before = unwrap(await db.from('optimizations').select('client_id').eq('id', req.params.id).maybeSingle())
  if (!before) throw httpError(404, 'Otimização não encontrada.')
  const patch = optimizationInput(req.body, { partial: true })
  const row = unwrap(await db.from('optimizations').update(patch).eq('id', req.params.id).select('*').single())
  // Se mudou de cliente, os dois resumos (antigo e novo) precisam ser refeitos.
  await recalcLastOptimization([before.client_id, row.client_id])
  res.json({ optimization: row })
})

app.delete('/api/optimizations/:id', async (req, res) => {
  const db = getDb()
  const before = unwrap(await db.from('optimizations').select('client_id').eq('id', req.params.id).maybeSingle())
  if (!before) throw httpError(404, 'Otimização não encontrada.')
  unwrap(await db.from('optimizations').delete().eq('id', req.params.id))
  await recalcLastOptimization(before.client_id)
  res.json({ ok: true })
})

// ----- Pendências -----

app.get('/api/pendencias', async (req, res) => {
  const db = getDb()
  let query = db.from('pendencias').select('*').order('created_at', { ascending: false }).limit(1000)
  if (req.query.status === 'open' || req.query.status === 'done') query = query.eq('status', req.query.status)
  if (req.query.client_id) query = query.eq('client_id', req.query.client_id)
  const [rows, names] = await Promise.all([query.then(unwrap), clientNames(db)])
  res.json({ pendencias: rows.map((p) => ({ ...p, client_name: names.get(p.client_id) || '—' })) })
})

function pendenciaInput(body, { partial }) {
  const out = {}
  if (!partial || 'client_id' in body) {
    if (!body.client_id) throw httpError(400, 'Escolha o cliente.')
    out.client_id = String(body.client_id)
  }
  if (!partial || 'title' in body) {
    const title = cleanText(body.title, 200)
    if (!title) throw httpError(400, 'Dê um título para a pendência.')
    out.title = title
  }
  if ('description' in body) out.description = cleanText(body.description, 4000)
  if ('due_date' in body) out.due_date = toDateOnly(body.due_date)
  if ('assignee' in body) out.assignee = cleanText(body.assignee, 80)
  if ('status' in body) {
    if (!['open', 'done'].includes(body.status)) throw httpError(400, 'Status inválido.')
    out.status = body.status
    out.done_at = body.status === 'done' ? new Date().toISOString() : null
  }
  return out
}

app.post('/api/pendencias', async (req, res) => {
  const db = getDb()
  const input = pendenciaInput(req.body, { partial: false })
  await getClientOr404(db, input.client_id, 'id')
  const row = unwrap(await db.from('pendencias').insert({ ...input, created_by: req.user.name }).select('*').single())
  res.status(201).json({ pendencia: row })
})

app.patch('/api/pendencias/:id', async (req, res) => {
  const row = unwrap(
    await getDb()
      .from('pendencias')
      .update(pendenciaInput(req.body, { partial: true }))
      .eq('id', req.params.id)
      .select('*')
      .maybeSingle(),
  )
  if (!row) throw httpError(404, 'Pendência não encontrada.')
  res.json({ pendencia: row })
})

app.delete('/api/pendencias/:id', async (req, res) => {
  unwrap(await getDb().from('pendencias').delete().eq('id', req.params.id))
  res.json({ ok: true })
})

// ----- Contatos do cliente -----

function contactInput(body, { partial }) {
  const out = {}
  if (!partial || 'client_id' in body) {
    if (!body.client_id) throw httpError(400, 'Cliente não informado.')
    out.client_id = String(body.client_id)
  }
  if (!partial || 'name' in body) {
    const name = cleanText(body.name, 120)
    if (!name) throw httpError(400, 'Informe o nome do contato.')
    out.name = name
  }
  if ('role' in body) out.role = cleanText(body.role, 80)
  if ('phone' in body) out.phone = cleanText(body.phone, 40)
  if ('email' in body) out.email = cleanText(body.email, 160)
  if ('is_decision_maker' in body) out.is_decision_maker = toBool(body.is_decision_maker)
  if ('notes' in body) out.notes = cleanText(body.notes, 1000)
  return out
}

app.post('/api/contacts', async (req, res) => {
  const db = getDb()
  const input = contactInput(req.body, { partial: false })
  await getClientOr404(db, input.client_id, 'id')
  const row = unwrap(await db.from('contacts').insert(input).select('*').single())
  res.status(201).json({ contact: row })
})

app.patch('/api/contacts/:id', async (req, res) => {
  const patch = contactInput(req.body, { partial: true })
  delete patch.client_id
  const row = unwrap(await getDb().from('contacts').update(patch).eq('id', req.params.id).select('*').maybeSingle())
  if (!row) throw httpError(404, 'Contato não encontrado.')
  res.json({ contact: row })
})

app.delete('/api/contacts/:id', async (req, res) => {
  unwrap(await getDb().from('contacts').delete().eq('id', req.params.id))
  res.json({ ok: true })
})

// ----- Funil comercial (leads) -----

function leadInput(body, { partial }) {
  const out = {}
  if (!partial || 'company' in body) {
    const company = cleanText(body.company, 120)
    if (!company) throw httpError(400, 'Informe o nome da empresa.')
    out.company = company
  }
  const texts = {
    contact_name: 120, contact_phone: 40, contact_email: 160, instagram: 120, segment: 80,
    source: 40, proposal_url: 500, next_step: 200, owner: 80, notes: 4000, lost_reason: 200,
  }
  for (const [key, max] of Object.entries(texts)) if (key in body) out[key] = cleanText(body[key], max)
  if ('fee_proposed' in body) out.fee_proposed = toNumber(body.fee_proposed)
  if ('media_budget' in body) out.media_budget = toNumber(body.media_budget)
  if ('next_step_at' in body) out.next_step_at = toDateOnly(body.next_step_at)
  if ('stage' in body) {
    if (!LEAD_STAGES.includes(body.stage)) throw httpError(400, 'Etapa inválida.')
    // Fechar tem rota própria porque cria o cliente junto (POST /api/leads/:id/win).
    if (body.stage === 'won') throw httpError(400, 'Use "Marcar como fechado" para converter o lead em cliente.')
    out.stage = body.stage
  }
  return out
}

async function getLeadOr404(db, id) {
  const lead = unwrap(await db.from('leads').select('*').eq('id', id).maybeSingle())
  if (!lead) throw httpError(404, 'Lead não encontrado.')
  return lead
}

// Lista com a data da última interação de cada lead, calculada em lote.
app.get('/api/leads', async (req, res) => {
  const db = getDb()
  const [leads, interactions] = await Promise.all([
    db.from('leads').select('*').order('updated_at', { ascending: false }),
    db.from('interactions').select('lead_id,happened_at').not('lead_id', 'is', null),
  ]).then((results) => results.map(unwrap))
  const last = new Map()
  for (const i of interactions) {
    if (!last.has(i.lead_id) || i.happened_at > last.get(i.lead_id)) last.set(i.lead_id, i.happened_at)
  }
  res.json({ leads: leads.map((l) => ({ ...l, last_interaction_at: last.get(l.id) || null })) })
})

app.get('/api/leads/:id', async (req, res) => {
  const db = getDb()
  const lead = await getLeadOr404(db, req.params.id)
  const interactions = unwrap(
    await db.from('interactions').select('*').eq('lead_id', lead.id).order('happened_at', { ascending: false }),
  )
  res.json({ lead, interactions })
})

app.post('/api/leads', async (req, res) => {
  const input = leadInput(req.body, { partial: false })
  const row = unwrap(
    await getDb()
      .from('leads')
      .insert({ ...input, stage: input.stage || 'lead', owner: input.owner || req.user.name, created_by: req.user.name })
      .select('*')
      .single(),
  )
  res.status(201).json({ lead: row })
})

app.patch('/api/leads/:id', async (req, res) => {
  const db = getDb()
  const current = await getLeadOr404(db, req.params.id)
  const patch = leadInput(req.body, { partial: true })
  const nowIso = new Date().toISOString()
  if ('stage' in patch && patch.stage !== current.stage) {
    patch.stage_changed_at = nowIso
    patch.lost_at = patch.stage === 'lost' ? nowIso : null
    if (patch.stage !== 'lost' && !('lost_reason' in patch)) patch.lost_reason = null
  }
  patch.updated_at = nowIso
  const row = unwrap(await db.from('leads').update(patch).eq('id', req.params.id).select('*').single())
  res.json({ lead: row })
})

// Apaga o lead e as interações que eram SÓ dele; as que já passaram pro
// cliente (lead fechado) continuam na linha do tempo do cliente.
app.delete('/api/leads/:id', async (req, res) => {
  const db = getDb()
  await getLeadOr404(db, req.params.id)
  unwrap(await db.from('interactions').delete().eq('lead_id', req.params.id).is('client_id', null))
  unwrap(await db.from('interactions').update({ lead_id: null }).eq('lead_id', req.params.id))
  unwrap(await db.from('leads').delete().eq('id', req.params.id))
  res.json({ ok: true })
})

// Fechou: cria o cliente com o que o funil já sabe (honorário, verba,
// contato, Instagram, link da proposta) e leva o histórico junto.
app.post('/api/leads/:id/win', async (req, res) => {
  const db = getDb()
  const lead = await getLeadOr404(db, req.params.id)
  if (lead.client_id) {
    const existing = unwrap(await db.from('clients').select('*').eq('id', lead.client_id).maybeSingle())
    if (existing) return res.json({ client: serializeClient(existing), lead })
  }
  const links = cleanLinks({ instagram: lead.instagram, proposta: lead.proposal_url })
  const client = unwrap(
    await db
      .from('clients')
      .insert({
        name: lead.company,
        manager: lead.owner,
        segment: lead.segment,
        fee_monthly: lead.fee_proposed,
        monthly_budget: lead.media_budget,
        contract_start: todayLocal(),
        links,
        notes: lead.notes,
        tags: ['onboarding'],
      })
      .select('*')
      .single(),
  )
  if (lead.contact_name) {
    unwrap(
      await db.from('contacts').insert({
        client_id: client.id,
        name: lead.contact_name,
        phone: lead.contact_phone,
        email: lead.contact_email,
        is_decision_maker: true,
      }),
    )
  }
  unwrap(await db.from('interactions').update({ client_id: client.id }).eq('lead_id', lead.id))
  const nowIso = new Date().toISOString()
  const updatedLead = unwrap(
    await db
      .from('leads')
      .update({ stage: 'won', won_at: nowIso, stage_changed_at: nowIso, lost_at: null, client_id: client.id, updated_at: nowIso })
      .eq('id', lead.id)
      .select('*')
      .single(),
  )
  await recalcLastContact(client.id)
  const fresh = unwrap(await db.from('clients').select('*').eq('id', client.id).single())
  res.status(201).json({ client: serializeClient(fresh), lead: updatedLead })
})

// ----- Linha do tempo (interações com cliente ou lead) -----

function interactionInput(body, { partial }) {
  const out = {}
  if (!partial) {
    if (!body.client_id && !body.lead_id) throw httpError(400, 'Informe o cliente ou o lead.')
    if (body.client_id) out.client_id = String(body.client_id)
    if (body.lead_id) out.lead_id = String(body.lead_id)
  }
  if (!partial || 'kind' in body) {
    const kind = body.kind || 'note'
    if (!INTERACTION_KINDS.includes(kind)) throw httpError(400, 'Tipo de interação inválido.')
    out.kind = kind
  }
  if (!partial || 'summary' in body) {
    const summary = cleanText(body.summary, 4000)
    if (!summary) throw httpError(400, 'Descreva o que aconteceu.')
    out.summary = summary
  }
  if (!partial || 'happened_at' in body) out.happened_at = toDateTime(body.happened_at)
  if ('next_step' in body) out.next_step = cleanText(body.next_step, 200)
  if ('next_step_at' in body) out.next_step_at = toDateOnly(body.next_step_at)
  if ('next_step_done' in body) out.next_step_done = toBool(body.next_step_done)
  return out
}

app.post('/api/interactions', async (req, res) => {
  const db = getDb()
  const input = interactionInput(req.body, { partial: false })
  if (input.client_id) await getClientOr404(db, input.client_id, 'id')
  if (input.lead_id) await getLeadOr404(db, input.lead_id)
  const row = unwrap(await db.from('interactions').insert({ ...input, created_by: req.user.name }).select('*').single())
  if (row.client_id) await recalcLastContact(row.client_id)
  // No funil, o próximo passo registrado na conversa vira o próximo passo do cartão.
  if (row.lead_id) {
    const leadPatch = { updated_at: new Date().toISOString() }
    if (row.next_step_at || row.next_step) {
      leadPatch.next_step = row.next_step
      leadPatch.next_step_at = row.next_step_at
    }
    unwrap(await db.from('leads').update(leadPatch).eq('id', row.lead_id))
  }
  res.status(201).json({ interaction: row })
})

app.patch('/api/interactions/:id', async (req, res) => {
  const db = getDb()
  const before = unwrap(await db.from('interactions').select('client_id').eq('id', req.params.id).maybeSingle())
  if (!before) throw httpError(404, 'Registro não encontrado.')
  const row = unwrap(
    await db.from('interactions').update(interactionInput(req.body, { partial: true })).eq('id', req.params.id).select('*').single(),
  )
  await recalcLastContact([before.client_id, row.client_id])
  res.json({ interaction: row })
})

app.delete('/api/interactions/:id', async (req, res) => {
  const db = getDb()
  const before = unwrap(await db.from('interactions').select('client_id').eq('id', req.params.id).maybeSingle())
  if (!before) throw httpError(404, 'Registro não encontrado.')
  unwrap(await db.from('interactions').delete().eq('id', req.params.id))
  await recalcLastContact(before.client_id)
  res.json({ ok: true })
})

// ----- Hoje: o que fazer agora (follow-ups, próximos passos do funil, pendências) -----
// Janela de 7 dias pra frente; o que está atrasado vem junto (sem limite pra trás).
app.get('/api/today', async (req, res) => {
  const db = getDb()
  const today = todayLocal()
  const horizon = shiftDate(today, 7)
  const [followups, leads, pendencias, names] = await Promise.all([
    db
      .from('interactions')
      .select('id,client_id,lead_id,kind,summary,next_step,next_step_at,happened_at')
      .eq('next_step_done', false)
      .not('next_step_at', 'is', null)
      .lte('next_step_at', horizon)
      .order('next_step_at', { ascending: true }),
    db.from('leads').select('id,company,stage,next_step,next_step_at,owner,fee_proposed,updated_at'),
    db
      .from('pendencias')
      .select('id,client_id,title,due_date,assignee')
      .eq('status', 'open')
      .not('due_date', 'is', null)
      .lte('due_date', horizon)
      .order('due_date', { ascending: true }),
    clientNames(db),
  ]).then(([a, b, c, d]) => [unwrap(a), unwrap(b), unwrap(c), d])

  const leadNames = new Map(leads.map((l) => [l.id, l.company]))
  res.json({
    today,
    followups: followups.map((f) => ({
      ...f,
      target_name: f.client_id ? names.get(f.client_id) || '—' : leadNames.get(f.lead_id) || '—',
    })),
    leads: leads.filter((l) => OPEN_STAGES.includes(l.stage)),
    pendencias: pendencias.map((p) => ({ ...p, client_name: names.get(p.client_id) || '—' })),
  })
})

// ----- Alertas -----

app.get('/api/alerts', async (req, res) => {
  const db = getDb()
  const limit = Math.min(Number(req.query.limit) || 300, 1000)
  let query = db.from('alerts').select('*').order('created_at', { ascending: false }).limit(limit)
  if (req.query.status === 'open') query = query.is('resolved_at', null)
  if (req.query.status === 'resolved') query = query.not('resolved_at', 'is', null)
  if (req.query.client_id) query = query.eq('client_id', req.query.client_id)
  const [rows, names] = await Promise.all([query.then(unwrap), clientNames(db)])
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
  res.status(status).json({
    error:
      status >= 500 && (err.expose === false || !err.code)
        ? 'Erro interno no servidor. Tente de novo em instantes.'
        : err.message,
    code: err.code,
  })
})

export default app
