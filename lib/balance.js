// Régua de saldo, usada tanto pra gerar alerta quanto pra pintar a tela.
// Fica num lugar só pra o selo vermelho da tela e o e-mail de alerta nunca
// discordarem entre si.

// Dias de saldo restantes no ritmo médio de gasto dos últimos 7 dias.
export const BALANCE_DAYS_CRITICAL = 3
export const BALANCE_DAYS_WARN = 7

// 'critical' | 'warn' | 'ok' | 'unknown'
// unknown = não dá pra saber (pós-pago no cartão, Google sem orçamento de
// conta, integração não configurada, erro na consulta).
export function balanceLevel(snapshot, threshold) {
  if (!snapshot || !snapshot.ok || snapshot.balance == null) return 'unknown'
  const balance = Number(snapshot.balance)
  if (balance <= 0) return 'critical'
  if (threshold != null && Number(threshold) > 0 && balance <= Number(threshold)) return 'critical'
  if (snapshot.days_left != null) {
    if (snapshot.days_left < BALANCE_DAYS_CRITICAL) return 'critical'
    if (snapshot.days_left < BALANCE_DAYS_WARN) return 'warn'
  }
  return 'ok'
}

const LEVEL_RANK = { critical: 3, warn: 2, ok: 1, unknown: 0 }

export function worstLevel(...levels) {
  return levels.reduce((worst, l) => (LEVEL_RANK[l] > LEVEL_RANK[worst] ? l : worst), 'unknown')
}
