// Filtros e ordenações da lista de clientes, compartilhados por TODAS as
// telas que mostram clientes (Painel, Clientes, Otimizações...).
// Filtro novo = uma entrada em CLIENT_FILTERS + um `case` em applyClientFilter.
// Propaga sozinho pra todas as abas, sem duplicar código em cada página.
import { daysSince, URGENCY_OK_MAX } from './urgency.js'
import { normalizeSearch } from './format.js'

export const CLIENT_FILTERS = [
  { id: 'active', label: 'Ativos' },
  { id: 'all', label: 'Todos' },
  { id: 'attention', label: 'Precisam de atenção' },
  { id: 'at_risk', label: 'Em risco de cancelar' },
  { id: 'no_contact', label: 'Sem contato há 15+ dias' },
  { id: 'low_balance', label: 'Saldo acabando' },
  { id: 'alerts', label: 'Com alerta aberto' },
  { id: 'pendencias', label: 'Com pendências' },
  { id: 'stale', label: 'Otimização atrasada (15+ dias)' },
  { id: 'meta', label: 'Com Meta Ads' },
  { id: 'google', label: 'Com Google Ads' },
  { id: 'inactive', label: 'Pausados / encerrados' },
]

export const CLIENT_SORTS = [
  { id: 'urgency', label: 'Mais urgentes primeiro' },
  { id: 'health', label: 'Pior saúde primeiro' },
  { id: 'fee', label: 'Maior honorário' },
  { id: 'last_contact', label: 'Contato mais antigo' },
  { id: 'name', label: 'Nome (A–Z)' },
  { id: 'days_left', label: 'Menos dias de saldo' },
  { id: 'last_opt', label: 'Otimização mais antiga' },
  { id: 'pendencias', label: 'Mais pendências' },
  { id: 'spend', label: 'Maior investimento (7 dias)' },
]

export const isLowBalance = (c) => c.balance_level === 'critical' || c.balance_level === 'warn'
export const isStale = (c) => {
  const d = daysSince(c.last_optimization_at)
  return d == null || d > URGENCY_OK_MAX
}
export const isNoContact = (c) => {
  const d = daysSince(c.last_contact_at)
  return d == null || d > URGENCY_OK_MAX
}
export const needsAttention = (c) =>
  c.status === 'active' && (isLowBalance(c) || c.open_alerts_count > 0 || c.overdue_pendencias_count > 0 || isStale(c))

export function applyClientFilter(clients, filterId) {
  switch (filterId) {
    case 'all':
      return clients
    case 'active':
      return clients.filter((c) => c.status === 'active')
    case 'inactive':
      return clients.filter((c) => c.status !== 'active')
    case 'attention':
      return clients.filter(needsAttention)
    case 'low_balance':
      return clients.filter((c) => c.status === 'active' && isLowBalance(c))
    case 'alerts':
      return clients.filter((c) => c.open_alerts_count > 0)
    case 'pendencias':
      return clients.filter((c) => c.open_pendencias_count > 0)
    case 'at_risk':
      return clients.filter((c) => c.health?.level === 'critical')
    case 'no_contact':
      return clients.filter((c) => c.status === 'active' && isNoContact(c))
    case 'stale':
      return clients.filter((c) => c.status === 'active' && isStale(c))
    case 'meta':
      return clients.filter((c) => c.meta_ad_account_id)
    case 'google':
      return clients.filter((c) => c.google_ads_customer_id)
    default:
      return clients
  }
}

// Pontuação de urgência: saldo crítico e alerta crítico pesam mais que
// pendência ou otimização atrasada. Serve pra ordenação padrão do Painel.
function urgencyScore(c) {
  if (c.status !== 'active') return -1
  let score = 0
  if (c.balance_level === 'critical') score += 100
  else if (c.balance_level === 'warn') score += 40
  score += (c.critical_alerts_count || 0) * 50 + (c.open_alerts_count || 0) * 10
  score += (c.overdue_pendencias_count || 0) * 8 + (c.open_pendencias_count || 0) * 2
  const d = daysSince(c.last_optimization_at)
  score += d == null ? 20 : Math.min(d, 60) / 2
  return score
}

const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR')
const nullsLast = (v, fallback) => (v == null ? fallback : v)

export function applyClientSort(clients, sortId) {
  const list = [...clients]
  switch (sortId) {
    case 'name':
      return list.sort(byName)
    case 'days_left':
      return list.sort((a, b) => nullsLast(a.min_days_left, Infinity) - nullsLast(b.min_days_left, Infinity) || byName(a, b))
    case 'last_opt':
      // Nunca otimizado = mais antigo de todos.
      return list.sort(
        (a, b) =>
          nullsLast(a.last_optimization_at && new Date(a.last_optimization_at).getTime(), 0) -
            nullsLast(b.last_optimization_at && new Date(b.last_optimization_at).getTime(), 0) || byName(a, b),
      )
    case 'pendencias':
      return list.sort((a, b) => b.open_pendencias_count - a.open_pendencias_count || byName(a, b))
    case 'health':
      // Sem nota (pausado/encerrado) vai pro fim.
      return list.sort((a, b) => nullsLast(a.health?.score, 999) - nullsLast(b.health?.score, 999) || byName(a, b))
    case 'fee':
      return list.sort((a, b) => (Number(b.fee_monthly) || 0) - (Number(a.fee_monthly) || 0) || byName(a, b))
    case 'last_contact':
      return list.sort(
        (a, b) =>
          nullsLast(a.last_contact_at && new Date(a.last_contact_at).getTime(), 0) -
            nullsLast(b.last_contact_at && new Date(b.last_contact_at).getTime(), 0) || byName(a, b),
      )
    case 'spend':
      return list.sort((a, b) => (b.spend_7d_total || 0) - (a.spend_7d_total || 0) || byName(a, b))
    case 'urgency':
    default:
      return list.sort((a, b) => urgencyScore(b) - urgencyScore(a) || byName(a, b))
  }
}

// Etiquetas: multi-seleção com lógica "OU" (tem qualquer uma das escolhidas).
export function applyTagFilter(clients, tagIds) {
  if (!tagIds?.length) return clients
  return clients.filter((c) => (c.tags || []).some((t) => tagIds.includes(t)))
}

export function applySearch(clients, query) {
  const q = normalizeSearch(query).trim()
  if (!q) return clients
  return clients.filter((c) =>
    normalizeSearch(`${c.name} ${c.manager || ''} ${c.meta_ad_account_id || ''} ${c.google_ads_customer_id || ''}`).includes(q),
  )
}

// Atalho usado pelas páginas: aplica tudo na ordem certa.
export function filterClients(clients, { filter, sort, tags, search }) {
  return applyClientSort(applySearch(applyTagFilter(applyClientFilter(clients, filter), tags), search), sort)
}
