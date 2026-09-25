// Régua ÚNICA de urgência por tempo, usada em todo selo e painel do app:
// verde até 14 dias, amarelo de 15 a 29, vermelho a partir de 30, cinza
// quando nunca foi registrado. Não inventar outra régua por tela.

export const URGENCY_OK_MAX = 14
export const URGENCY_WARN_MAX = 29

export function daysSince(date) {
  if (!date) return null
  const ms = Date.now() - new Date(date).getTime()
  return Math.max(0, Math.floor(ms / 86400000))
}

// 'ok' | 'warn' | 'critical' | 'never'
export function urgencyLevel(days) {
  if (days == null) return 'never'
  if (days <= URGENCY_OK_MAX) return 'ok'
  if (days <= URGENCY_WARN_MAX) return 'warn'
  return 'critical'
}

// Classes por nível, compartilhadas pela régua de tempo E pelo nível de saldo
// (que vem pronto do backend: ok/warn/critical/unknown). Strings completas
// porque o Tailwind só gera classe que aparece inteira no código.
export const LEVEL_STYLES = {
  ok: {
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25',
    dot: 'bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-300',
    bar: 'bg-emerald-500',
  },
  warn: {
    badge: 'bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/25',
    dot: 'bg-amber-500',
    text: 'text-amber-700 dark:text-amber-300',
    bar: 'bg-amber-500',
  },
  critical: {
    badge: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/25',
    dot: 'bg-rose-500',
    text: 'text-rose-700 dark:text-rose-300',
    bar: 'bg-rose-500',
  },
  never: {
    badge: 'bg-slate-100 text-slate-600 ring-slate-500/15 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600/40',
    dot: 'bg-slate-400',
    text: 'text-slate-500 dark:text-slate-400',
    bar: 'bg-slate-400',
  },
}
LEVEL_STYLES.unknown = LEVEL_STYLES.never

export function optimizationLabel(date) {
  const days = daysSince(date)
  if (days == null) return 'Nunca registrada'
  if (days === 0) return 'Hoje'
  if (days === 1) return 'Ontem'
  return `Há ${days} dias`
}
