// SÓ para desenvolvimento local sem credenciais da Meta/Google: gera um
// snapshot plausível a partir do anterior, pra dar pra testar o fluxo inteiro
// (verificar agora → histórico → alertas → tela) sem tocar em conta real.
// checks.js só chama isto quando o banco é o de memória (nunca na Vercel).
import { round } from './util.js'

const jitter = (value, pct) => value * (1 + (Math.random() * 2 - 1) * pct)

export function fakeSnapshot(platform, client) {
  const prev = client[`${platform}_snapshot`]
  const nowIso = new Date().toISOString()
  // Conta de demonstração "com erro" continua com erro, pra o alerta seguir visível.
  if (prev && !prev.ok) return { ...prev, checked_at: nowIso }

  const base = prev?.ok
    ? prev
    : {
        account_name: client.name,
        currency: 'BRL',
        status: 'active',
        status_label: 'Ativa',
        payment_type: platform === 'meta' ? 'prepaid' : 'account_budget',
        balance: 600,
        balance_source: platform === 'meta' ? 'prepaid' : 'account_budget',
        avg_daily_spend: 80,
        results_7d: 20,
        result_label: platform === 'meta' ? 'conversas' : 'conversões',
        active_campaigns: 2,
      }

  const avg = jitter(base.avg_daily_spend || 60, 0.12)
  const spendToday = avg * (0.3 + Math.random() * 0.5)
  const spendYesterday = base.spend_yesterday === 0 ? 0 : jitter(avg, 0.2)
  const spend7d = avg * 7
  const balance = base.balance == null ? null : Math.max(0, base.balance - spendToday * 0.3)
  const results = base.results_7d == null ? null : Math.max(0, Math.round(jitter(base.results_7d, 0.15)))

  return {
    ...base,
    platform,
    ok: true,
    checked_at: nowIso,
    balance: round(balance),
    spend_today: round(spendToday),
    spend_yesterday: round(spendYesterday),
    spend_7d: round(spend7d),
    avg_daily_spend: round(avg),
    days_left: balance != null && avg > 0 ? round(balance / avg, 1) : null,
    results_7d: results,
    cost_per_result: results > 0 ? round(spend7d / results) : null,
  }
}
