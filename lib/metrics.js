// Números da agência (receita recorrente, ticket, carteira, funil). Calculados
// no backend a partir das fichas e do funil, pra página "Números" e o agente
// (Hermes, via MCP) enxergarem exatamente os mesmos valores.
// Não há lançamento financeiro: é tudo "só valores" da ficha, por decisão.
import { dateInTz } from './util.js'

const DAY = 24 * 60 * 60 * 1000
const TZ = () => process.env.CHECK_TIMEZONE || 'America/Sao_Paulo'
const fee = (c) => Number(c.fee_monthly) || 0
const OPEN_STAGES = ['lead', 'meeting', 'proposal', 'negotiation']
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// Início de um contrato como Date (data sem hora vira meio-dia de Brasília).
const startOf = (c) => (c.contract_start ? new Date(`${c.contract_start}T12:00:00-03:00`) : new Date(c.created_at))

// Receita recorrente no fim de um mês: quem já tinha começado e ainda não
// tinha cancelado. Pausado conta nos meses passados (pagava na época), mas não
// no mês atual.
function mrrAt(clients, monthEnd, isCurrent) {
  return clients.reduce((sum, c) => {
    if (!fee(c)) return sum
    if (isCurrent && c.status !== 'active') return sum
    if (startOf(c) > monthEnd) return sum
    if (c.status === 'churned' && (!c.churned_at || new Date(c.churned_at) <= monthEnd)) return sum
    return sum + fee(c)
  }, 0)
}

// `clients` já serializados (com health); `leads` crus da tabela.
export function computeMetrics(clients, leads, now = new Date()) {
  const [year, month] = dateInTz(now, TZ()).split('-').map(Number)
  const active = clients.filter((c) => c.status === 'active')
  const paying = active.filter((c) => fee(c) > 0)
  const mrr = paying.reduce((s, c) => s + fee(c), 0)

  const history = Array.from({ length: 6 }, (_, i) => {
    const monthsAgo = 5 - i
    const d = new Date(Date.UTC(year, month - 1 - monthsAgo, 1))
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth() // 0-11
    const isCurrent = monthsAgo === 0
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
    const end = isCurrent ? now : new Date(`${y}-${String(m + 1).padStart(2, '0')}-${lastDay}T23:59:59-03:00`)
    return { label: `${MONTHS[m]}/${String(y).slice(2)}`, value: mrrAt(clients, end, isCurrent), is_current: isCurrent }
  })

  const owners = new Map()
  for (const c of paying) {
    const key = c.manager || 'Sem responsável'
    const e = owners.get(key) || { label: key, value: 0, clients: 0 }
    e.value += fee(c)
    e.clients++
    owners.set(key, e)
  }

  const monthStart = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00-03:00`)
  const churned = clients
    .filter((c) => c.status === 'churned' && c.churned_at && new Date(c.churned_at) >= monthStart)
    .map((c) => ({ id: c.id, name: c.name, fee: fee(c) }))

  const health = { ok: 0, warn: 0, critical: 0 }
  for (const c of active) if (c.health) health[c.health.level]++

  const since = now.getTime() - 90 * DAY
  const won = leads.filter((l) => l.stage === 'won' && l.won_at && new Date(l.won_at) >= since)
  const lost = leads.filter((l) => l.stage === 'lost' && l.lost_at && new Date(l.lost_at) >= since)
  const open = leads.filter((l) => OPEN_STAGES.includes(l.stage))
  const reasons = new Map()
  for (const l of lost) {
    const r = (l.lost_reason || 'Sem motivo').split(' — ')[0]
    reasons.set(r, (reasons.get(r) || 0) + 1)
  }
  const daysToClose = won.map((l) => (new Date(l.won_at) - new Date(l.created_at)) / DAY).filter((d) => d >= 0)

  return {
    mrr,
    ticket: paying.length ? Math.round((mrr / paying.length) * 100) / 100 : 0,
    active_count: active.length,
    paying_count: paying.length,
    media_budget_total: active.reduce((s, c) => s + (Number(c.monthly_budget) || 0), 0),
    missing_fee: active.filter((c) => !fee(c)).map((c) => ({ id: c.id, name: c.name })),
    history,
    by_owner: [...owners.values()].sort((a, b) => b.value - a.value),
    churned,
    churned_value: churned.reduce((s, c) => s + c.fee, 0),
    health,
    funnel: {
      open_count: open.length,
      open_value: open.reduce((s, l) => s + (Number(l.fee_proposed) || 0), 0),
      new_leads_90d: leads.filter((l) => new Date(l.created_at) >= since).length,
      won_90d: won.length,
      won_value_90d: won.reduce((s, l) => s + (Number(l.fee_proposed) || 0), 0),
      lost_90d: lost.length,
      close_rate: won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : null,
      avg_days_to_close: daysToClose.length ? Math.round(daysToClose.reduce((a, b) => a + b, 0) / daysToClose.length) : null,
      lost_reasons: [...reasons.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    },
  }
}
