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

function pickResult(totals, metric) {
  const order = metric === 'auto' || !RESULT_METRICS[metric] ? ['messages', 'leads', 'purchases'] : [metric]
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
