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
import { recalcLastOptimization } from '../lib/summary.js'
import { httpError, cleanText } from '../lib/util.js'

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
  return {
    ...rest,
    has_meta_token: Boolean(tokenEnc),
    meta_level: metaLevel,
    google_level: googleLevel,
    balance_level: worstLevel(metaLevel || 'unknown', googleLevel || 'unknown'),
    min_days_left: daysLeft.length ? Math.min(...daysLeft) : null,
    spend_7d_total: Math.round(spend7d * 100) / 100,
    ...extras,
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
app.post('/api/cron/check', async (req, res) => {
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
})

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

  const today = new Date().toISOString().slice(0, 10)
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
  const [snapshots, optimizations, pendencias, alerts] = await Promise.all([
    db
      .from('account_snapshots')
      .select('platform,checked_at,ok,balance,spend_today,spend_yesterday,spend_7d,results_7d,active_campaigns')
      .eq('client_id', client.id)
      .gte('checked_at', since)
      .order('checked_at', { ascending: true }),
    db.from('optimizations').select('*').eq('client_id', client.id).order('performed_at', { ascending: false }).limit(200),
    db.from('pendencias').select('*').eq('client_id', client.id).order('created_at', { ascending: false }).limit(200),
    db.from('alerts').select('*').eq('client_id', client.id).order('created_at', { ascending: false }).limit(100),
  ]).then((results) => results.map(unwrap))

  const openPend = pendencias.filter((p) => p.status === 'open')
  const openAlerts = alerts.filter((a) => !a.resolved_at)
  res.json({
    client: serializeClient(client, {
      open_pendencias_count: openPend.length,
      open_alerts_count: openAlerts.length,
      critical_alerts_count: openAlerts.filter((a) => a.severity === 'critical').length,
    }),
    snapshots,
    optimizations,
    pendencias,
    alerts,
  })
})

app.patch('/api/clients/:id', async (req, res) => {
  const db = getDb()
  const current = await getClientOr404(db, req.params.id, 'id,meta_ad_account_id,google_ads_customer_id')
  const patch = clientInput(req.body, { partial: true })
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
