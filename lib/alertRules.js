// Regras de alerta (funções puras, sem banco): a partir do último snapshot de
// cada plataforma, diz quais problemas o cliente tem agora. Separado do
// alerts.js pra poder ser usado também pelos dados de demonstração.
import { balanceLevel } from './balance.js'

export const PLATFORM_LABEL = { meta: 'Meta Ads', google: 'Google Ads' }

const brl = (value, currency = 'BRL') => {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value)
  } catch {
    return `R$ ${Number(value).toFixed(2)}`
  }
}

// Texto curto e direto, do jeito que a equipe fala: "pode se esgotar em ~3 dias".
function balanceMessage(label, s, threshold) {
  const saldo = brl(s.balance, s.currency)
  if (Number(s.balance) <= 0) return `Saldo do ${label} esgotou (${saldo}): os anúncios param de rodar.`
  if (s.days_left != null && s.days_left < 7) {
    if (s.days_left < 1) return `Saldo do ${label} pode se esgotar hoje (${saldo} restantes).`
    const n = Math.round(s.days_left)
    return `Saldo do ${label} pode se esgotar em ~${n} ${n === 1 ? 'dia' : 'dias'} (${saldo} restantes).`
  }
  return `Saldo do ${label} (${saldo}) abaixo do mínimo de ${brl(threshold, s.currency)} definido para o cliente.`
}

// Avalia as condições de alerta a partir do último snapshot de cada plataforma.
// Cliente pausado/encerrado não gera alerta (e os abertos são resolvidos).
export function evaluateAlerts(client) {
  if (client.status !== 'active') return []
  const out = []
  for (const platform of ['meta', 'google']) {
    const s = client[`${platform}_snapshot`]
    if (!s) continue
    const label = PLATFORM_LABEL[platform]

    if (!s.ok) {
      // Integração ainda não configurada é estado esperado, não problema do cliente.
      if (s.error_code === 'not_configured') continue
      out.push({
        platform,
        type: 'integration_error',
        severity: 'warning',
        message: `Não foi possível consultar ${label}: ${s.error}`,
      })
      continue
    }

    if (s.status === 'blocked') {
      out.push({
        platform,
        type: 'account_blocked',
        severity: 'critical',
        message: `Conta ${label} com status "${s.status_label}".`,
      })
    }

    const level = balanceLevel(s, client.balance_alert_threshold)
    if (level === 'critical' || level === 'warn') {
      out.push({
        platform,
        type: 'balance_low',
        severity: level === 'critical' ? 'critical' : 'warning',
        message: balanceMessage(label, s, client.balance_alert_threshold),
      })
    }

    // Usa o gasto de ONTEM (dia fechado) pra não acusar "sem entrega" de manhã cedo.
    if (s.active_campaigns > 0 && s.spend_yesterday === 0 && s.status !== 'blocked') {
      out.push({
        platform,
        type: 'no_delivery',
        severity: 'warning',
        message: `${s.active_campaigns} campanha(s) ativa(s) em ${label}, mas nenhum gasto ontem.`,
      })
    }
  }
  return out
}
