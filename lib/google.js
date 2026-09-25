// Integração com a Google Ads API (REST + GAQL), só leitura.
// Usa um único refresh token da conta MCC da agência (GOOGLE_ADS_LOGIN_CUSTOMER_ID)
// pra ler todas as contas de clientes vinculadas a ela.
import { dateInTz, shiftDate, round } from './util.js'

const apiVersion = () => process.env.GOOGLE_ADS_API_VERSION || 'v25'
const REQUIRED = ['GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN']

export function googleConfigured() {
  return REQUIRED.every((k) => process.env[k])
}

// Aceita "123-456-7890" ou "1234567890"; guarda só os dígitos.
export function normalizeGoogleCustomerId(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits || null
}

// O access token vale ~1h; reaproveita entre clientes na mesma execução.
let tokenCache = null
async function getAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(15000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.access_token) {
    throw new Error(
      body.error === 'invalid_grant'
        ? 'Refresh token do Google expirado ou revogado: gere um novo.'
        : `Falha ao autenticar no Google (${body.error || res.status}).`,
    )
  }
  tokenCache = { token: body.access_token, expiresAt: Date.now() + (body.expires_in || 3600) * 1000 }
  return tokenCache.token
}

async function gaql(customerId, query) {
  const token = await getAccessToken()
  const headers = {
    Authorization: `Bearer ${token}`,
    'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    'Content-Type': 'application/json',
  }
  const loginId = normalizeGoogleCustomerId(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID)
  if (loginId) headers['login-customer-id'] = loginId

  const res = await fetch(`https://googleads.googleapis.com/${apiVersion()}/customers/${customerId}/googleAds:search`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(20000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = body.error?.details?.[0]?.errors?.[0]
    const err = new Error(detail?.message || body.error?.message || `HTTP ${res.status}`)
    err.googleCode = detail?.errorCode ? Object.values(detail.errorCode)[0] : body.error?.status
    throw err
  }
  return body.results || []
}

function friendlyError(err) {
  const code = String(err.googleCode || '')
  if (code === 'USER_PERMISSION_DENIED' || code === 'PERMISSION_DENIED') {
    return 'Sem permissão nesta conta: confira se ela está vinculada à MCC da agência.'
  }
  if (code === 'CUSTOMER_NOT_FOUND' || code === 'INVALID_CUSTOMER_ID') return 'Conta do Google Ads não encontrada: confira o ID.'
  if (code === 'DEVELOPER_TOKEN_NOT_APPROVED') return 'Developer token ainda sem aprovação de acesso básico.'
  if (code === 'CUSTOMER_NOT_ENABLED') return 'A conta do Google Ads não está ativa.'
  if (err.name === 'TimeoutError') return 'O Google demorou demais para responder.'
  return err.message || 'Erro desconhecido no Google Ads.'
}

const micros = (v) => (v == null ? 0 : Number(v) / 1_000_000)

const CUSTOMER_STATUS = {
  ENABLED: ['active', 'Ativa'],
  SUSPENDED: ['blocked', 'Suspensa'],
  CANCELED: ['blocked', 'Cancelada'],
  CLOSED: ['blocked', 'Encerrada'],
}

// Orçamento de conta (account budget): existe em contas com faturamento
// mensal ou "ordem de orçamento". Sobra = limite aprovado − valor já veiculado.
// Conta com pagamento manual (pré-pago via boleto/Pix) não expõe saldo na API.
async function fetchAccountBudget(customerId) {
  try {
    const rows = await gaql(
      customerId,
      `SELECT account_budget.status, account_budget.approved_spending_limit_micros,
              account_budget.approved_spending_limit_type, account_budget.adjusted_spending_limit_micros,
              account_budget.adjusted_spending_limit_type, account_budget.amount_served_micros,
              account_budget.approved_end_date_time
       FROM account_budget WHERE account_budget.status = 'APPROVED'`,
    )
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19)
    const active = rows
      .map((r) => r.accountBudget)
      .find((b) => !b.approvedEndDateTime || b.approvedEndDateTime > nowStr)
    if (!active) return null
    const infinite =
      (active.adjustedSpendingLimitType || active.approvedSpendingLimitType) === 'INFINITE'
    const limit = active.adjustedSpendingLimitMicros ?? active.approvedSpendingLimitMicros
    if (infinite || limit == null) return null
    return Math.max(0, micros(limit) - micros(active.amountServedMicros))
  } catch {
    // Sem permissão de faturamento não é erro do monitoramento: só não há saldo.
    return null
  }
}

export async function fetchGoogleSnapshot({ customerId }) {
  const cid = normalizeGoogleCustomerId(customerId)
  try {
    const [customerRows, dailyRows, todayRows, campaignRows, budgetBalance] = await Promise.all([
      gaql(cid, 'SELECT customer.descriptive_name, customer.currency_code, customer.status, customer.time_zone FROM customer'),
      gaql(
        cid,
        'SELECT segments.date, metrics.cost_micros, metrics.conversions FROM customer WHERE segments.date DURING LAST_7_DAYS',
      ),
      gaql(cid, 'SELECT metrics.cost_micros FROM customer WHERE segments.date DURING TODAY'),
      gaql(
        cid,
        "SELECT campaign.id FROM campaign WHERE campaign.status = 'ENABLED' AND campaign.serving_status = 'SERVING'",
      ),
      fetchAccountBudget(cid),
    ])

    const customer = customerRows[0]?.customer || {}
    const [status, statusLabel] = CUSTOMER_STATUS[customer.status] || ['unknown', customer.status || 'Desconhecido']
    const tz = customer.timeZone || 'America/Sao_Paulo'
    const yesterday = shiftDate(dateInTz(new Date(), tz), -1)

    const spend7d = dailyRows.reduce((s, r) => s + micros(r.metrics?.costMicros), 0)
    const conversions = dailyRows.reduce((s, r) => s + Number(r.metrics?.conversions || 0), 0)
    const spendYesterday = micros(dailyRows.find((r) => r.segments?.date === yesterday)?.metrics?.costMicros)
    const spendToday = todayRows.reduce((s, r) => s + micros(r.metrics?.costMicros), 0)
    const avgDaily = spend7d / 7

    return {
      platform: 'google',
      ok: true,
      checked_at: new Date().toISOString(),
      account_name: customer.descriptiveName || null,
      currency: customer.currencyCode || 'BRL',
      status,
      status_label: statusLabel,
      payment_type: budgetBalance != null ? 'account_budget' : 'unknown',
      payment_label: null,
      balance: round(budgetBalance),
      balance_source: budgetBalance != null ? 'account_budget' : null,
      spend_today: round(spendToday),
      spend_yesterday: round(spendYesterday),
      spend_7d: round(spend7d),
      avg_daily_spend: round(avgDaily),
      days_left: budgetBalance != null && avgDaily > 0 ? round(budgetBalance / avgDaily, 1) : null,
      results_7d: round(conversions, 1),
      result_label: 'conversões',
      cost_per_result: conversions > 0 ? round(spend7d / conversions) : null,
      active_campaigns: campaignRows.length,
      active_campaigns_capped: false,
    }
  } catch (err) {
    return {
      platform: 'google',
      ok: false,
      checked_at: new Date().toISOString(),
      error: friendlyError(err),
      error_code: 'api_error',
    }
  }
}
