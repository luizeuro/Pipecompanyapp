// Regras e operações do CRM num lugar só. As rotas da API (api/index.js) e as
// ferramentas do agente (lib/mcp.js, usado pelo Hermes) chamam estas mesmas
// funções: validação, cálculo de saúde, agenda do dia e números nunca podem
// divergir entre o que a equipe vê na tela e o que o agente lê ou grava.
// `actor` = quem está agindo ({ name }), gravado em created_by.
import { getDb, unwrap } from './db.js'
import { encrypt } from './crypto.js'
import { balanceLevel, worstLevel } from './balance.js'
import { normalizeMetaAccountId } from './meta.js'
import { normalizeGoogleCustomerId } from './google.js'
import { recalcLastOptimization, recalcLastContact } from './summary.js'
import { clientHealth } from './health.js'
import { computeMetrics } from './metrics.js'
import { httpError, cleanText, dateInTz, shiftDate } from './util.js'

export const CLIENT_STATUSES = ['active', 'paused', 'churned']
export const RESULT_METRICS = ['auto', 'messages', 'leads', 'purchases']
export const OPT_PLATFORMS = ['meta', 'google', 'both', 'other']
export const LEAD_STAGES = ['lead', 'meeting', 'proposal', 'negotiation', 'won', 'lost']
export const OPEN_STAGES = ['lead', 'meeting', 'proposal', 'negotiation']
export const INTERACTION_KINDS = ['meeting', 'call', 'whatsapp', 'email', 'report', 'complaint', 'praise', 'note']
export const REPORT_KINDS = ['report', 'analysis', 'daily']
const LINK_KEYS = ['site', 'instagram', 'drive', 'gtm', 'proposta', 'outro']
const DAY = 24 * 60 * 60 * 1000

// "Hoje" no fuso da agência (e não em UTC, que vira o dia às 21h de Brasília).
export const todayLocal = () => dateInTz(new Date(), process.env.CHECK_TIMEZONE || 'America/Sao_Paulo')

// ---------------------------------------------------------------------------
// Conversões e validações de entrada
// ---------------------------------------------------------------------------

export function toNumber(value, { allowNull = true } = {}) {
  if (value === '' || value == null) return allowNull ? null : 0
  const n = Number(String(value).replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) throw httpError(400, 'Valor numérico inválido.')
  return n
}

export function toDateTime(value) {
  if (!value) return new Date().toISOString()
  // "AAAA-MM-DD" vindo do formulário vira meio-dia de Brasília, pra não virar
  // o dia anterior por causa de fuso.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00-03:00`) : new Date(value)
  if (Number.isNaN(d.getTime())) throw httpError(400, 'Data inválida.')
  return d.toISOString()
}

export function toDateOnly(value) {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw httpError(400, 'Data inválida (use AAAA-MM-DD).')
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

const normalizeName = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

// Remove o token criptografado e anexa níveis de saldo e saúde já calculados,
// pra tela, alerta e agente usarem exatamente a mesma régua.
export function serializeClient(c, extras = {}) {
  const { meta_access_token_enc: tokenEnc, ...rest } = c
  // Cliente pausado/encerrado não tem urgência de saldo (mesma regra dos alertas).
  const level = (s) => (c.status === 'active' ? balanceLevel(s, c.balance_alert_threshold) : 'unknown')
  const metaLevel = c.meta_ad_account_id ? level(c.meta_snapshot) : null
  const googleLevel = c.google_ads_customer_id ? level(c.google_snapshot) : null
  const daysLeft = [c.meta_snapshot, c.google_snapshot].filter((s) => s?.ok && s.days_left != null).map((s) => s.days_left)
  const spend7d = [c.meta_snapshot, c.google_snapshot].filter((s) => s?.ok).reduce((sum, s) => sum + Number(s.spend_7d || 0), 0)
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
    health: clientHealth(c, {
      criticalAlerts: extras.critical_alerts_count || 0,
      openAlerts: extras.open_alerts_count || 0,
      overduePendencias: extras.overdue_pendencias_count || 0,
      balanceLevel: balance,
    }),
  }
}

export function clientInput(body, { partial }) {
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

export async function getClientOr404(db, id, columns = '*') {
  const client = unwrap(await db.from('clients').select(columns).eq('id', id).maybeSingle())
  if (!client) throw httpError(404, 'Cliente não encontrado.')
  return client
}

export async function clientNames(db) {
  const rows = unwrap(await db.from('clients').select('id,name'))
  return new Map(rows.map((r) => [r.id, r.name]))
}

// Lista com contagens calculadas EM LOTE: 3 consultas no total, não 1 por cliente.
export async function listClients() {
  const db = getDb()
  const [clients, pendencias, alerts] = await Promise.all([
    db.from('clients').select('*').order('name'),
    db.from('pendencias').select('client_id,due_date').eq('status', 'open'),
    db.from('alerts').select('client_id,severity').is('resolved_at', null),
  ]).then((results) => results.map(unwrap))

  const today = todayLocal()
  const pend = new Map()
  for (const p of pendencias) {
    const e = pend.get(p.client_id) || { open: 0, overdue: 0 }
    e.open++
    if (p.due_date && p.due_date < today) e.overdue++
    pend.set(p.client_id, e)
  }
  const alertCount = new Map()
  for (const a of alerts) {
    const e = alertCount.get(a.client_id) || { open: 0, critical: 0 }
    e.open++
    if (a.severity === 'critical') e.critical++
    alertCount.set(a.client_id, e)
  }
  return clients.map((c) =>
    serializeClient(c, {
      open_pendencias_count: pend.get(c.id)?.open || 0,
      overdue_pendencias_count: pend.get(c.id)?.overdue || 0,
      open_alerts_count: alertCount.get(c.id)?.open || 0,
      critical_alerts_count: alertCount.get(c.id)?.critical || 0,
    }),
  )
}

// Ficha completa: cliente + 30 dias de histórico + otimizações, pendências,
// alertas, contatos, linha do tempo e relatórios.
export async function getClientDetail(id) {
  const db = getDb()
  const client = await getClientOr404(db, id)
  const since = new Date(Date.now() - 30 * DAY).toISOString()
  const [snapshots, optimizations, pendencias, alerts, contacts, interactions, reports] = await Promise.all([
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
    db.from('reports').select('*').eq('client_id', client.id).order('created_at', { ascending: false }).limit(50),
  ]).then((results) => results.map(unwrap))

  const today = todayLocal()
  const openPend = pendencias.filter((p) => p.status === 'open')
  const openAlerts = alerts.filter((a) => !a.resolved_at)
  return {
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
    reports,
  }
}

export async function createClient(body) {
  const client = unwrap(await getDb().from('clients').insert(clientInput(body, { partial: false })).select('*').single())
  return serializeClient(client)
}

export async function updateClient(id, body) {
  const db = getDb()
  const current = await getClientOr404(db, id, 'id,status,meta_ad_account_id,google_ads_customer_id')
  const patch = clientInput(body, { partial: true })
  // Data do cancelamento alimenta a métrica "cancelamentos no mês".
  if ('status' in patch && patch.status !== current.status) {
    patch.churned_at = patch.status === 'churned' ? new Date().toISOString() : null
  }
  // Trocou/removeu a conta: o snapshot antigo é de outra conta, então descarta.
  if ('meta_ad_account_id' in patch && patch.meta_ad_account_id !== current.meta_ad_account_id) patch.meta_snapshot = null
  if ('google_ads_customer_id' in patch && patch.google_ads_customer_id !== current.google_ads_customer_id) patch.google_snapshot = null
  patch.updated_at = new Date().toISOString()
  const client = unwrap(await db.from('clients').update(patch).eq('id', id).select('*').single())
  return serializeClient(client)
}

export async function deleteClient(id) {
  const db = getDb()
  await getClientOr404(db, id, 'id')
  unwrap(await db.from('clients').delete().eq('id', id))
}

// Aceita o ID ou um pedaço do nome ("sorriso" acha "Clínica Sorriso Maior").
// Usado pelo agente, que conversa com nomes e não com IDs.
export async function resolveClient(ref) {
  const db = getDb()
  if (UUID_RE.test(String(ref))) return getClientOr404(db, ref, 'id,name,status')
  const q = normalizeName(ref)
  if (!q) throw httpError(400, 'Informe o cliente (nome ou ID).')
  const all = unwrap(await db.from('clients').select('id,name,status'))
  const exact = all.filter((c) => normalizeName(c.name) === q)
  const found = exact.length ? exact : all.filter((c) => normalizeName(c.name).includes(q))
  if (found.length === 1) return found[0]
  if (!found.length) throw httpError(404, `Nenhum cliente com "${ref}". Use listar_clientes para ver os nomes.`)
  throw httpError(409, `Mais de um cliente com "${ref}": ${found.map((c) => c.name).join(', ')}. Seja mais específico.`)
}

// Histórico das contas de anúncio de um cliente (saldo, gasto, resultado).
export async function getAccountHistory(clientId, days = 30) {
  const db = getDb()
  const client = await getClientOr404(db, clientId)
  const since = new Date(Date.now() - Math.min(Math.max(days, 1), 90) * DAY).toISOString()
  const snapshots = unwrap(
    await db
      .from('account_snapshots')
      .select('platform,checked_at,ok,balance,spend_today,spend_yesterday,spend_7d,results_7d,active_campaigns')
      .eq('client_id', client.id)
      .gte('checked_at', since)
      .order('checked_at', { ascending: true }),
  )
  return { client: serializeClient(client), snapshots }
}

// ---------------------------------------------------------------------------
// Otimizações
// ---------------------------------------------------------------------------

export function optimizationInput(body, { partial }) {
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

export async function listOptimizations({ clientId, limit = 300 } = {}) {
  const db = getDb()
  let query = db.from('optimizations').select('*').order('performed_at', { ascending: false }).limit(Math.min(limit, 1000))
  if (clientId) query = query.eq('client_id', clientId)
  const [rows, names] = await Promise.all([query.then(unwrap), clientNames(db)])
  return rows.map((o) => ({ ...o, client_name: names.get(o.client_id) || '—' }))
}

export async function createOptimization(body, actor) {
  const db = getDb()
  const input = optimizationInput(body, { partial: false })
  await getClientOr404(db, input.client_id, 'id')
  const row = unwrap(await db.from('optimizations').insert({ ...input, created_by: actor.name }).select('*').single())
  await recalcLastOptimization(row.client_id)
  return row
}

export async function updateOptimization(id, body) {
  const db = getDb()
  const before = unwrap(await db.from('optimizations').select('client_id').eq('id', id).maybeSingle())
  if (!before) throw httpError(404, 'Otimização não encontrada.')
  const row = unwrap(await db.from('optimizations').update(optimizationInput(body, { partial: true })).eq('id', id).select('*').single())
  // Se mudou de cliente, os dois resumos (antigo e novo) precisam ser refeitos.
  await recalcLastOptimization([before.client_id, row.client_id])
  return row
}

export async function deleteOptimization(id) {
  const db = getDb()
  const before = unwrap(await db.from('optimizations').select('client_id').eq('id', id).maybeSingle())
  if (!before) throw httpError(404, 'Otimização não encontrada.')
  unwrap(await db.from('optimizations').delete().eq('id', id))
  await recalcLastOptimization(before.client_id)
}

// ---------------------------------------------------------------------------
// Pendências (tarefas)
// ---------------------------------------------------------------------------

export function pendenciaInput(body, { partial }) {
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

export async function listPendencias({ status, clientId } = {}) {
  const db = getDb()
  let query = db.from('pendencias').select('*').order('created_at', { ascending: false }).limit(1000)
  if (status === 'open' || status === 'done') query = query.eq('status', status)
  if (clientId) query = query.eq('client_id', clientId)
  const [rows, names] = await Promise.all([query.then(unwrap), clientNames(db)])
  return rows.map((p) => ({ ...p, client_name: names.get(p.client_id) || '—' }))
}

export async function createPendencia(body, actor) {
  const db = getDb()
  const input = pendenciaInput(body, { partial: false })
  await getClientOr404(db, input.client_id, 'id')
  return unwrap(await db.from('pendencias').insert({ ...input, created_by: actor.name }).select('*').single())
}

export async function updatePendencia(id, body) {
  const row = unwrap(await getDb().from('pendencias').update(pendenciaInput(body, { partial: true })).eq('id', id).select('*').maybeSingle())
  if (!row) throw httpError(404, 'Pendência não encontrada.')
  return row
}

export async function deletePendencia(id) {
  unwrap(await getDb().from('pendencias').delete().eq('id', id))
}

// ---------------------------------------------------------------------------
// Contatos do cliente
// ---------------------------------------------------------------------------

export function contactInput(body, { partial }) {
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

export async function createContact(body) {
  const db = getDb()
  const input = contactInput(body, { partial: false })
  await getClientOr404(db, input.client_id, 'id')
  return unwrap(await db.from('contacts').insert(input).select('*').single())
}

export async function updateContact(id, body) {
  const patch = contactInput(body, { partial: true })
  delete patch.client_id
  const row = unwrap(await getDb().from('contacts').update(patch).eq('id', id).select('*').maybeSingle())
  if (!row) throw httpError(404, 'Contato não encontrado.')
  return row
}

export async function deleteContact(id) {
  unwrap(await getDb().from('contacts').delete().eq('id', id))
}

// ---------------------------------------------------------------------------
// Funil comercial (leads)
// ---------------------------------------------------------------------------

export function leadInput(body, { partial }) {
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
    // Fechar tem operação própria porque cria o cliente junto (winLead).
    if (body.stage === 'won') throw httpError(400, 'Use "Marcar como fechado" para converter o lead em cliente.')
    out.stage = body.stage
  }
  return out
}

export async function getLeadOr404(db, id) {
  const lead = unwrap(await db.from('leads').select('*').eq('id', id).maybeSingle())
  if (!lead) throw httpError(404, 'Lead não encontrado.')
  return lead
}

// Lista com a data da última interação de cada lead, calculada em lote.
export async function listLeads() {
  const db = getDb()
  const [leads, interactions] = await Promise.all([
    db.from('leads').select('*').order('updated_at', { ascending: false }),
    db.from('interactions').select('lead_id,happened_at').not('lead_id', 'is', null),
  ]).then((results) => results.map(unwrap))
  const last = new Map()
  for (const i of interactions) {
    if (!last.has(i.lead_id) || i.happened_at > last.get(i.lead_id)) last.set(i.lead_id, i.happened_at)
  }
  return leads.map((l) => ({ ...l, last_interaction_at: last.get(l.id) || null }))
}

export async function getLead(id) {
  const db = getDb()
  const lead = await getLeadOr404(db, id)
  const interactions = unwrap(await db.from('interactions').select('*').eq('lead_id', lead.id).order('happened_at', { ascending: false }))
  return { lead, interactions }
}

export async function createLead(body, actor) {
  const input = leadInput(body, { partial: false })
  return unwrap(
    await getDb()
      .from('leads')
      .insert({ ...input, stage: input.stage || 'lead', owner: input.owner || actor.name, created_by: actor.name })
      .select('*')
      .single(),
  )
}

export async function updateLead(id, body) {
  const db = getDb()
  const current = await getLeadOr404(db, id)
  const patch = leadInput(body, { partial: true })
  const nowIso = new Date().toISOString()
  if ('stage' in patch && patch.stage !== current.stage) {
    patch.stage_changed_at = nowIso
    patch.lost_at = patch.stage === 'lost' ? nowIso : null
    if (patch.stage !== 'lost' && !('lost_reason' in patch)) patch.lost_reason = null
  }
  patch.updated_at = nowIso
  return unwrap(await db.from('leads').update(patch).eq('id', id).select('*').single())
}

// Apaga o lead e as interações que eram SÓ dele; as que já passaram pro
// cliente (lead fechado) continuam na linha do tempo do cliente.
export async function deleteLead(id) {
  const db = getDb()
  await getLeadOr404(db, id)
  unwrap(await db.from('interactions').delete().eq('lead_id', id).is('client_id', null))
  unwrap(await db.from('interactions').update({ lead_id: null }).eq('lead_id', id))
  unwrap(await db.from('leads').delete().eq('id', id))
}

// Fechou: cria o cliente com o que o funil já sabe (honorário, verba,
// contato, Instagram, link da proposta) e leva o histórico junto.
// Devolve { created } pra rota saber se criou agora ou se já existia.
export async function winLead(id) {
  const db = getDb()
  const lead = await getLeadOr404(db, id)
  if (lead.client_id) {
    const existing = unwrap(await db.from('clients').select('*').eq('id', lead.client_id).maybeSingle())
    if (existing) return { client: serializeClient(existing), lead, created: false }
  }
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
        links: cleanLinks({ instagram: lead.instagram, proposta: lead.proposal_url }),
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
  return { client: serializeClient(fresh), lead: updatedLead, created: true }
}

// ---------------------------------------------------------------------------
// Linha do tempo (interações com cliente ou lead)
// ---------------------------------------------------------------------------

export function interactionInput(body, { partial }) {
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

export async function createInteraction(body, actor) {
  const db = getDb()
  const input = interactionInput(body, { partial: false })
  if (input.client_id) await getClientOr404(db, input.client_id, 'id')
  if (input.lead_id) await getLeadOr404(db, input.lead_id)
  const row = unwrap(await db.from('interactions').insert({ ...input, created_by: actor.name }).select('*').single())
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
  return row
}

export async function updateInteraction(id, body) {
  const db = getDb()
  const before = unwrap(await db.from('interactions').select('client_id').eq('id', id).maybeSingle())
  if (!before) throw httpError(404, 'Registro não encontrado.')
  const row = unwrap(await db.from('interactions').update(interactionInput(body, { partial: true })).eq('id', id).select('*').single())
  await recalcLastContact([before.client_id, row.client_id])
  return row
}

export async function deleteInteraction(id) {
  const db = getDb()
  const before = unwrap(await db.from('interactions').select('client_id').eq('id', id).maybeSingle())
  if (!before) throw httpError(404, 'Registro não encontrado.')
  unwrap(await db.from('interactions').delete().eq('id', id))
  await recalcLastContact(before.client_id)
}

// ---------------------------------------------------------------------------
// Hoje: follow-ups, próximos passos do funil e pendências com prazo
// ---------------------------------------------------------------------------

// Janela de 7 dias pra frente; o que está atrasado vem junto (sem limite pra trás).
export async function getToday() {
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
  return {
    today,
    followups: followups.map((f) => ({
      ...f,
      target_name: f.client_id ? names.get(f.client_id) || '—' : leadNames.get(f.lead_id) || '—',
    })),
    leads: leads.filter((l) => OPEN_STAGES.includes(l.stage)),
    pendencias: pendencias.map((p) => ({ ...p, client_name: names.get(p.client_id) || '—' })),
  }
}

// Visão do dia pro agente: a agenda + quem precisa de atenção (a mesma
// informação que a tela Hoje monta a partir da lista de clientes).
export async function getAgenda() {
  const [today, clients] = await Promise.all([getToday(), listClients()])
  const t = today.today
  const active = clients.filter((c) => c.status === 'active')
  const daysSince = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / DAY) : null)
  const inDays = (d) => Math.round((new Date(`${d}T12:00:00-03:00`) - new Date(`${t}T12:00:00-03:00`)) / DAY)
  const pick = (c) => ({ id: c.id, name: c.name })
  return {
    hoje: t,
    atrasados: {
      follow_ups: today.followups.filter((f) => f.next_step_at < t),
      funil: today.leads.filter((l) => l.next_step_at && l.next_step_at < t),
      pendencias: today.pendencias.filter((p) => p.due_date < t),
    },
    para_hoje: {
      follow_ups: today.followups.filter((f) => f.next_step_at === t),
      funil: today.leads.filter((l) => l.next_step_at === t),
      pendencias: today.pendencias.filter((p) => p.due_date === t),
    },
    proximos_7_dias: {
      follow_ups: today.followups.filter((f) => f.next_step_at > t),
      funil: today.leads.filter((l) => l.next_step_at && l.next_step_at > t && inDays(l.next_step_at) <= 7),
      pendencias: today.pendencias.filter((p) => p.due_date > t),
    },
    leads_sem_proximo_passo: today.leads.filter((l) => !l.next_step_at).map((l) => ({ id: l.id, company: l.company, stage: l.stage })),
    clientes_em_risco: active
      .filter((c) => c.health && c.health.level !== 'ok')
      .sort((a, b) => a.health.score - b.health.score)
      .map((c) => ({ ...pick(c), saude: c.health.score, nivel: c.health.label, motivos: c.health.reasons })),
    sem_contato_15_dias: active
      .filter((c) => {
        const d = daysSince(c.last_contact_at)
        return d == null || d > 14
      })
      .map((c) => ({ ...pick(c), dias_sem_contato: daysSince(c.last_contact_at) })),
    saldo_acabando: active
      .filter((c) => c.balance_level === 'critical' || c.balance_level === 'warn')
      .map((c) => ({ ...pick(c), nivel: c.balance_level, dias_de_saldo: c.min_days_left })),
    renovacoes_30_dias: active
      .filter((c) => c.renewal_date && inDays(c.renewal_date) <= 30)
      .map((c) => ({ ...pick(c), renovacao: c.renewal_date })),
  }
}

// ---------------------------------------------------------------------------
// Relatórios e análises (publicados pela equipe ou pelo agente)
// ---------------------------------------------------------------------------

export function reportInput(body) {
  const kind = body.kind || 'report'
  if (!REPORT_KINDS.includes(kind)) throw httpError(400, 'Tipo de relatório inválido (report, analysis ou daily).')
  const title = cleanText(body.title, 200)
  if (!title) throw httpError(400, 'Dê um título ao relatório.')
  const content = cleanText(body.content, 50000)
  if (!content) throw httpError(400, 'O relatório está vazio.')
  return {
    client_id: body.client_id ? String(body.client_id) : null,
    kind,
    title,
    content,
    period_start: toDateOnly(body.period_start),
    period_end: toDateOnly(body.period_end),
  }
}

export async function listReports({ clientId, kind, limit = 100 } = {}) {
  const db = getDb()
  let query = db.from('reports').select('*').order('created_at', { ascending: false }).limit(Math.min(limit, 500))
  if (clientId) query = query.eq('client_id', clientId)
  if (kind && REPORT_KINDS.includes(kind)) query = query.eq('kind', kind)
  const [rows, names] = await Promise.all([query.then(unwrap), clientNames(db)])
  return rows.map((r) => ({ ...r, client_name: r.client_id ? names.get(r.client_id) || '—' : null }))
}

export async function createReport(body, actor) {
  const db = getDb()
  const input = reportInput(body)
  if (input.client_id) await getClientOr404(db, input.client_id, 'id')
  return unwrap(await db.from('reports').insert({ ...input, created_by: actor.name }).select('*').single())
}

export async function deleteReport(id) {
  unwrap(await getDb().from('reports').delete().eq('id', id))
}

// ---------------------------------------------------------------------------
// Números da agência
// ---------------------------------------------------------------------------

export async function getMetrics() {
  const [clients, leads] = await Promise.all([listClients(), getDb().from('leads').select('*').then(unwrap)])
  return computeMetrics(clients, leads)
}
