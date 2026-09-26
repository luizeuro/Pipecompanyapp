// Saúde do cliente: um número de 0 a 100 e um nível, juntando sinais que o
// app já tem (último contato, última otimização, alertas, pendências, saldo).
// Serve pra achar quem corre risco de cancelar antes que o cliente reclame.
// Cada ponto perdido vira um motivo em português, pra tela explicar a nota.

const DAY = 24 * 60 * 60 * 1000

// Mesma régua de dias da tela (web/src/lib/urgency.js): até 14 ok, 15–29
// atenção, 30+ crítico, sem registro = nunca. Não inventar outra régua aqui.
function daysSince(date) {
  if (!date) return null
  return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / DAY))
}
function ruler(days) {
  if (days == null) return 'never'
  if (days <= 14) return 'ok'
  if (days <= 29) return 'warn'
  return 'critical'
}

export const HEALTH_LABEL = { ok: 'Saudável', warn: 'Atenção', critical: 'Em risco' }

// Só cliente ativo tem saúde (pausado/encerrado devolve null).
export function clientHealth(c, { criticalAlerts = 0, openAlerts = 0, overduePendencias = 0, balanceLevel = 'unknown' } = {}) {
  if (c.status !== 'active') return null
  let score = 100
  const reasons = []
  // Cliente recém-chegado (até 14 dias do início do contrato, ou do cadastro)
  // ainda não teve tempo de ter contato/otimização registrados: "nunca" não pesa.
  const sinceStart = daysSince(c.contract_start || c.created_at)
  const onboarding = sinceStart != null && sinceStart <= 14

  const contactDays = daysSince(c.last_contact_at)
  const contact = ruler(contactDays)
  if (contact === 'never') {
    if (!onboarding) {
      score -= 25
      reasons.push('Nenhum contato registrado')
    }
  } else if (contact !== 'ok') {
    score -= contact === 'critical' ? 35 : 15
    reasons.push(`Sem contato há ${contactDays} dias`)
  }

  const optDays = daysSince(c.last_optimization_at)
  const opt = ruler(optDays)
  if (opt === 'never') {
    if (!onboarding) {
      score -= 20
      reasons.push('Nenhuma otimização registrada')
    }
  } else if (opt !== 'ok') {
    score -= opt === 'critical' ? 30 : 15
    reasons.push(`Sem otimização há ${optDays} dias`)
  }

  if (criticalAlerts > 0) {
    score -= 20
    reasons.push(`${criticalAlerts} alerta(s) crítico(s) aberto(s)`)
  } else if (openAlerts > 0) {
    score -= 5
    reasons.push(`${openAlerts} alerta(s) aberto(s)`)
  }

  if (overduePendencias > 0) {
    score -= Math.min(20, overduePendencias * 10)
    reasons.push(`${overduePendencias} pendência(s) atrasada(s)`)
  }

  if (balanceLevel === 'critical') {
    score -= 15
    reasons.push('Saldo de anúncio acabando')
  }

  score = Math.max(0, score)
  const level = score >= 75 ? 'ok' : score >= 50 ? 'warn' : 'critical'
  return { score, level, label: HEALTH_LABEL[level], reasons, onboarding }
}
