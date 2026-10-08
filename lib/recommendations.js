// Recomendações automáticas por campanha (regras simples, sem IA): os
// padrões que mais custam dinheiro nas contas da Pipe (ver o Raio-X de
// 29/09/2026): campanha ativa sem entrega, orçamento total acabando,
// público saturado, custo subindo, custo acima da meta do cliente e verba
// baixa demais pra sair do aprendizado. Também aponta o que dá pra escalar.
// level: 'critical' (resolver hoje) | 'warn' (olhar nesta semana) | 'good' (oportunidade)

const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

export function campaignRecommendations(c, { targetCpr = null } = {}) {
  const out = []
  if (c.status !== 'active') return out
  const avgDaily = c.spend_7d / 7

  if (c.spend_7d === 0) {
    out.push({
      level: 'critical',
      code: 'no_delivery',
      text: 'Ativa e sem gasto em 7 dias: conferir conjuntos pausados, anúncios reprovados ou pagamento.',
    })
    return out
  }
  if (c.budget_remaining != null && avgDaily > 0) {
    const days = c.budget_remaining / avgDaily
    if (days < 3) {
      out.push({
        level: 'critical',
        code: 'lifetime_ending',
        text: `Orçamento total acaba em ~${Math.max(0, Math.round(days))} dia(s) (${brl(c.budget_remaining)} restantes): renovar ou passar para orçamento diário.`,
      })
    }
  }
  if (c.frequency_7d != null && c.frequency_7d >= 4) {
    out.push({
      level: c.frequency_7d >= 6 ? 'critical' : 'warn',
      code: 'frequency',
      text: `Frequência ${c.frequency_7d.toFixed(1).replace('.', ',')} na semana: público saturando. Abrir o público (Advantage+) ou trocar criativos.`,
    })
  }
  if (c.cost_change_pct != null && c.cost_change_pct >= 30 && c.spend_7d >= 50) {
    out.push({
      level: 'warn',
      code: 'cost_up',
      text: `Custo por resultado subiu ${c.cost_change_pct}% contra a semana anterior: revisar criativos cansados e mudanças recentes.`,
    })
  }
  if (targetCpr && c.cost_per_result != null && c.cost_per_result > targetCpr * 1.2) {
    out.push({
      level: 'warn',
      code: 'above_target',
      text: `Custo por resultado (${brl(c.cost_per_result)}) acima da meta do cliente (${brl(targetCpr)}).`,
    })
  }
  if (c.results_7d != null && c.results_7d === 0 && c.spend_7d >= 70 && c.result_label) {
    out.push({
      level: 'warn',
      code: 'no_results',
      text: `${brl(c.spend_7d)} gastos na semana sem nenhum resultado: conferir o rastreamento e a página de destino.`,
    })
  }
  if (c.daily_budget != null && c.daily_budget < 15 && ['Vendas', 'Cadastros'].includes(c.objective)) {
    out.push({
      level: 'warn',
      code: 'small_budget',
      text: `R$ ${Math.round(c.daily_budget)}/dia é pouco para sair do aprendizado em ${c.objective.toLowerCase()}: concentrar a verba em menos conjuntos.`,
    })
  }
  const cheaper = c.cost_change_pct != null && c.cost_change_pct <= -20
  const withinTarget = !targetCpr || (c.cost_per_result != null && c.cost_per_result <= targetCpr)
  if (!out.length && cheaper && withinTarget && (c.results_7d || 0) >= 5) {
    out.push({
      level: 'good',
      code: 'scale',
      text: `Custo caiu ${Math.abs(c.cost_change_pct)}% e está na meta: candidata a escalar (até +20% de verba a cada 3–4 dias).`,
    })
  }
  return out
}

const RANK = { critical: 0, warn: 1, good: 2 }

// Anexa as recomendações em cada campanha e devolve o resumo da conta.
export function withRecommendations(campaigns, opts) {
  const list = campaigns.map((c) => {
    const recs = campaignRecommendations(c, opts).sort((a, b) => RANK[a.level] - RANK[b.level])
    return { ...c, recommendations: recs }
  })
  const all = list.flatMap((c) => c.recommendations)
  return {
    campaigns: list,
    summary: {
      critical: all.filter((r) => r.level === 'critical').length,
      warn: all.filter((r) => r.level === 'warn').length,
      good: all.filter((r) => r.level === 'good').length,
    },
  }
}
