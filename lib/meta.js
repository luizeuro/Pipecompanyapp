// Integração com a Marketing API da Meta (Graph API).
// Só LÊ o que o painel precisa: status da conta, saldo, gasto recente,
// resultados e campanhas ativas. Nunca altera nada na conta do cliente.
import crypto from 'node:crypto'
import { parseMoney, dateInTz, shiftDate, round } from './util.js'

const apiVersion = () => process.env.META_API_VERSION || 'v25.0'

export function metaConfigured() {
  return Boolean(process.env.META_SYSTEM_USER_TOKEN)
}

// Aceita "act_123", "123" ou colado com espaço/traço; guarda só os dígitos.
export function normalizeMetaAccountId(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits || null
}

// Moedas em que a Meta NÃO usa centavos nos campos de valor da conta.
const NO_CENTS = new Set(['CLP', 'COP', 'CRC', 'HUF', 'ISK', 'IDR', 'JPY', 'KRW', 'PYG', 'TWD', 'VND'])
const currencyOffset = (currency) => (NO_CENTS.has(currency) ? 1 : 100)

// account_status da Meta → estado do painel.
const ACCOUNT_STATUS = {
  1: ['active', 'Ativa'],
  2: ['blocked', 'Desativada'],
  3: ['blocked', 'Pagamento pendente'],
  7: ['blocked', 'Em análise de risco'],
  8: ['blocked', 'Liquidação pendente'],
  9: ['blocked', 'Período de carência (pagamento falhou)'],
  100: ['blocked', 'Encerramento pendente'],
  101: ['blocked', 'Encerrada'],
  201: ['active', 'Ativa'],
  202: ['blocked', 'Encerrada'],
}

// Qual ação conta como "resultado". A ordem de cada lista é prioridade:
// pega o PRIMEIRO tipo que tiver valor, nunca soma (os tipos se sobrepõem,
// ex: "purchase" já inclui a compra do pixel).
export const RESULT_METRICS = {
  messages: { label: 'conversas', types: ['onsite_conversion.messaging_conversation_started_7d'] },
  leads: { label: 'leads', types: ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'] },
  purchases: { label: 'compras', types: ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'] },
}

function pickResult(totals, metric, autoOrder = ['messages', 'leads', 'purchases']) {
  const order = metric === 'auto' || !RESULT_METRICS[metric] ? autoOrder : [metric]
  for (const key of order) {
    const type = RESULT_METRICS[key].types.find((t) => totals[t] > 0)
    if (type) return { count: totals[type], label: RESULT_METRICS[key].label }
  }
  // Métrica fixa sem resultado no período: mostra zero com o rótulo certo.
  if (RESULT_METRICS[metric]) return { count: 0, label: RESULT_METRICS[metric].label }
  return { count: null, label: null }
}

// Traduz os erros mais comuns da Graph API pra algo acionável.
function friendlyError(err) {
  const code = err.metaCode
  const msg = err.message || ''
  if (code === 190) return 'Token da Meta inválido ou expirado.'
  if ([10, 200, 294].includes(code) || /permission/i.test(msg)) {
    return 'Sem permissão nesta conta: adicione a conta de anúncios ao usuário do sistema no Business Manager.'
  }
  if (code === 100 && /does not exist|cannot be loaded|Unsupported get request/i.test(msg)) {
    return 'Conta de anúncios não encontrada: confira o ID.'
  }
  if ([4, 17, 32, 613, 80004].includes(code)) return 'Limite de requisições da Meta atingido; tenta de novo mais tarde.'
  if (err.name === 'TimeoutError') return 'A Meta demorou demais para responder.'
  return msg || 'Erro desconhecido na Meta.'
}

async function graphGet(path, params, token) {
  const url = new URL(`https://graph.facebook.com/${apiVersion()}/${path}`)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, typeof value === 'string' ? value : JSON.stringify(value))
  }
  url.searchParams.set('access_token', token)
  // appsecret_proof: exigido quando o app tem "Exigir chave secreta do app" ligado.
  if (process.env.META_APP_SECRET) {
    const proof = crypto.createHmac('sha256', process.env.META_APP_SECRET).update(token).digest('hex')
    url.searchParams.set('appsecret_proof', proof)
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.error) {
    const err = new Error(body.error?.message || `HTTP ${res.status}`)
    err.metaCode = body.error?.code
    throw err
  }
  return body
}

// Snapshot normalizado de uma conta da Meta. Mesmo formato do Google
// (ver google.js), pra tela e alertas tratarem as duas plataformas igual.
export async function fetchMetaSnapshot({ accountId, token, resultMetric = 'auto' }) {
  const act = `act_${normalizeMetaAccountId(accountId)}`
  try {
    const [account, daily, today, campaigns] = await Promise.all([
      graphGet(
        act,
        {
          fields:
            'name,account_status,currency,timezone_name,balance,amount_spent,spend_cap,is_prepay_account,funding_source_details',
        },
        token,
      ),
      // last_7d = 7 dias fechados (sem hoje). Dia sem entrega NÃO vem na resposta.
      graphGet(
        `${act}/insights`,
        { fields: 'spend,actions', date_preset: 'last_7d', time_increment: '1', limit: '31' },
        token,
      ),
      graphGet(`${act}/insights`, { fields: 'spend', date_preset: 'today' }, token),
      graphGet(`${act}/campaigns`, { fields: 'id', effective_status: ['ACTIVE'], limit: '200' }, token),
    ])

    const currency = account.currency || 'BRL'
    const offset = currencyOffset(currency)
    const [status, statusLabel] = ACCOUNT_STATUS[account.account_status] || ['unknown', `Status ${account.account_status}`]

    const tz = account.timezone_name || 'America/Sao_Paulo'
    const yesterday = shiftDate(dateInTz(new Date(), tz), -1)
    const rows = daily.data || []
    const spend7d = rows.reduce((sum, r) => sum + Number(r.spend || 0), 0)
    const spendYesterday = Number(rows.find((r) => r.date_start === yesterday)?.spend || 0)
    const spendToday = Number(today.data?.[0]?.spend || 0)

    const totals = {}
    for (const row of rows) {
      for (const a of row.actions || []) totals[a.action_type] = (totals[a.action_type] || 0) + Number(a.value || 0)
    }
    const result = pickResult(totals, resultMetric)

    // Saldo: conta pré-paga (boleto/Pix) mostra "Saldo disponível (R$ X)" no
    // funding_source_details. Senão, se houver limite de gastos da conta, o que
    // sobra do limite é o "saldo" útil. Pós-pago no cartão sem limite: sem saldo.
    let balance = null
    let balanceSource = null
    const display = account.funding_source_details?.display_string
    if (account.is_prepay_account && display && /saldo|balance|fundos|funds/i.test(display)) {
      balance = parseMoney(display)
      if (balance != null) balanceSource = 'prepaid'
    }
    const spendCap = Number(account.spend_cap || 0) / offset
    const amountSpent = Number(account.amount_spent || 0) / offset
    if (balance == null && spendCap > 0) {
      balance = Math.max(0, spendCap - amountSpent)
      balanceSource = 'spend_cap'
    }

    const avgDaily = spend7d / 7
    return {
      platform: 'meta',
      ok: true,
      checked_at: new Date().toISOString(),
      account_name: account.name || null,
      currency,
      status,
      status_label: statusLabel,
      payment_type: account.is_prepay_account ? 'prepaid' : 'postpaid',
      payment_label: display || null,
      balance: round(balance),
      balance_source: balanceSource,
      spend_today: round(spendToday),
      spend_yesterday: round(spendYesterday),
      spend_7d: round(spend7d),
      avg_daily_spend: round(avgDaily),
      days_left: balance != null && avgDaily > 0 ? round(balance / avgDaily, 1) : null,
      results_7d: result.count,
      result_label: result.label,
      cost_per_result: result.count > 0 ? round(spend7d / result.count) : null,
      active_campaigns: campaigns.data?.length ?? 0,
      active_campaigns_capped: Boolean(campaigns.paging?.next),
    }
  } catch (err) {
    return {
      platform: 'meta',
      ok: false,
      checked_at: new Date().toISOString(),
      error: friendlyError(err),
      error_code: 'api_error',
    }
  }
}

// ---------------------------------------------------------------------------
// Campanhas da conta (só leitura), pra ver dentro do painel: status, orçamento,
// gasto, resultado e se o custo por resultado subiu ou caiu contra os 7 dias
// anteriores. Consulta na hora (não fica guardado no banco).
// ---------------------------------------------------------------------------

// Qual resultado olhar primeiro, conforme o objetivo da campanha.
const OBJECTIVE_ORDER = {
  OUTCOME_SALES: ['purchases', 'messages', 'leads'],
  OUTCOME_LEADS: ['leads', 'messages', 'purchases'],
  OUTCOME_ENGAGEMENT: ['messages', 'leads', 'purchases'],
}
const OBJECTIVE_LABEL = {
  OUTCOME_SALES: 'Vendas',
  OUTCOME_LEADS: 'Cadastros',
  OUTCOME_ENGAGEMENT: 'Engajamento',
  OUTCOME_TRAFFIC: 'Tráfego',
  OUTCOME_AWARENESS: 'Reconhecimento',
  OUTCOME_APP_PROMOTION: 'App',
}
const CAMPAIGN_STATUS = {
  ACTIVE: ['active', 'Ativa'],
  PAUSED: ['paused', 'Pausada'],
  CAMPAIGN_PAUSED: ['paused', 'Pausada'],
  WITH_ISSUES: ['issue', 'Com problema'],
  IN_PROCESS: ['review', 'Processando'],
  PENDING_REVIEW: ['review', 'Em análise'],
  DISAPPROVED: ['issue', 'Reprovada'],
  PENDING_BILLING_INFO: ['issue', 'Falta pagamento'],
}

function campaignResult(actions, objective, metric) {
  const totals = {}
  for (const a of actions || []) totals[a.action_type] = (totals[a.action_type] || 0) + Number(a.value || 0)
  const r = pickResult(totals, metric, OBJECTIVE_ORDER[objective])
  if (r.count != null && r.count > 0) return r
  // Tráfego/perfil: sem conversa, cadastro ou compra, mostra os cliques no link.
  if (totals.link_click > 0 && (metric === 'auto' || !RESULT_METRICS[metric])) return { count: totals.link_click, label: 'cliques' }
  return r
}

export async function fetchMetaCampaigns({ accountId, token, resultMetric = 'auto', timeZone = 'America/Sao_Paulo' }) {
  const act = `act_${normalizeMetaAccountId(accountId)}`
  const today = dateInTz(new Date(), timeZone)
  const previous = { since: shiftDate(today, -14), until: shiftDate(today, -8) }
  const insightFields = 'campaign_id,spend,impressions,clicks,frequency,actions'
  const [list, current, before] = await Promise.all([
    graphGet(
      `${act}/campaigns`,
      {
        fields: 'id,name,objective,effective_status,daily_budget,lifetime_budget,budget_remaining,start_time,stop_time',
        // Valores aceitos pela Meta no filtro de campanha (apagadas/arquivadas ficam de fora).
        effective_status: ['ACTIVE', 'PAUSED', 'IN_PROCESS', 'WITH_ISSUES'],
        limit: '200',
      },
      token,
    ),
    graphGet(`${act}/insights`, { level: 'campaign', fields: insightFields, date_preset: 'last_7d', limit: '500' }, token),
    graphGet(`${act}/insights`, { level: 'campaign', fields: insightFields, time_range: previous, limit: '500' }, token),
  ])

  const byId = (rows) => new Map((rows.data || []).map((r) => [r.campaign_id, r]))
  const cur = byId(current)
  const prev = byId(before)
  const campaigns = (list.data || []).map((c) => {
    const [status, statusLabel] = CAMPAIGN_STATUS[c.effective_status] || ['other', c.effective_status]
    const now = cur.get(c.id)
    const old = prev.get(c.id)
    const spend = Number(now?.spend || 0)
    const result = campaignResult(now?.actions, c.objective, resultMetric)
    const cpr = result.count > 0 ? round(spend / result.count) : null
    const oldSpend = Number(old?.spend || 0)
    const oldResult = campaignResult(old?.actions, c.objective, resultMetric)
    const oldCpr = oldResult.count > 0 && oldResult.label === result.label ? round(oldSpend / oldResult.count) : null
    return {
      id: c.id,
      name: c.name,
      objective: OBJECTIVE_LABEL[c.objective] || c.objective || null,
      status,
      status_label: statusLabel,
      // Orçamento em centavos na Meta. Vazio = orçamento definido em cada conjunto.
      daily_budget: c.daily_budget ? round(Number(c.daily_budget) / 100) : null,
      lifetime_budget: c.lifetime_budget ? round(Number(c.lifetime_budget) / 100) : null,
      budget_remaining: c.lifetime_budget && c.budget_remaining ? round(Number(c.budget_remaining) / 100) : null,
      stop_time: c.stop_time || null,
      spend_7d: round(spend),
      impressions_7d: Number(now?.impressions || 0),
      clicks_7d: Number(now?.clicks || 0),
      frequency_7d: now?.frequency ? round(Number(now.frequency), 2) : null,
      results_7d: result.count,
      result_label: result.label,
      cost_per_result: cpr,
      prev_spend_7d: round(oldSpend),
      prev_cost_per_result: oldCpr,
      cost_change_pct: cpr != null && oldCpr ? round(((cpr - oldCpr) / oldCpr) * 100, 0) : null,
    }
  })
  // Ativas primeiro, depois quem gastou mais.
  const rank = { active: 0, issue: 1, review: 2, paused: 3, other: 4 }
  campaigns.sort((a, b) => rank[a.status] - rank[b.status] || b.spend_7d - a.spend_7d || a.name.localeCompare(b.name))
  return { period: { current: 'últimos 7 dias', previous }, campaigns, capped: Boolean(list.paging?.next) }
}

export { friendlyError as metaFriendlyError }
