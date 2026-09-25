// Dados de demonstração do banco em memória (desenvolvimento local apenas).
// Cobrem de propósito cada estado da tela: saldo crítico, saldo em atenção,
// pós-pago sem saldo, erro de integração, campanha ativa sem gasto, cliente
// pausado e otimizações nas quatro faixas da régua (ok/atenção/crítico/nunca).
import crypto from 'node:crypto'
import { evaluateAlerts } from './alertRules.js'
import { round } from './util.js'

const DAY = 24 * 60 * 60 * 1000
const daysAgo = (n, hour = 10) => {
  const d = new Date(Date.now() - n * DAY)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}
const dateOnly = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10)

function snapshot(platform, over) {
  const avg = over.avg_daily_spend ?? 0
  const spend7d = over.spend_7d ?? round(avg * 7)
  const balance = over.balance ?? null
  return {
    platform,
    ok: true,
    checked_at: daysAgo(0, new Date().getHours()),
    account_name: null,
    currency: 'BRL',
    status: 'active',
    status_label: 'Ativa',
    payment_type: 'prepaid',
    payment_label: null,
    balance_source: balance != null ? (platform === 'meta' ? 'prepaid' : 'account_budget') : null,
    spend_today: round(avg * 0.45),
    spend_yesterday: round(avg * 1.05),
    spend_7d: spend7d,
    days_left: balance != null && avg > 0 ? round(balance / avg, 1) : null,
    result_label: platform === 'meta' ? 'conversas' : 'conversões',
    cost_per_result: over.results_7d > 0 ? round(spend7d / over.results_7d) : null,
    active_campaigns: 2,
    active_campaigns_capped: false,
    ...over,
    balance,
    avg_daily_spend: avg,
  }
}

export function buildDemoData() {
  const id = () => crypto.randomUUID()
  const c = {
    litoral: id(),
    sorriso: id(),
    ferramentas: id(),
    fisio: id(),
    academia: id(),
    restaurante: id(),
  }

  const clients = [
    {
      id: c.litoral,
      name: 'Demo · Imobiliária Litoral',
      tags: ['imobiliaria', 'prioridade'],
      manager: 'Luiz',
      meta_ad_account_id: '1234567890',
      google_ads_customer_id: '1112223333',
      result_metric: 'leads',
      balance_alert_threshold: 100,
      monthly_budget: 3000,
      meta_snapshot: snapshot('meta', {
        account_name: 'Imobiliária Litoral',
        balance: 180,
        avg_daily_spend: 95,
        results_7d: 41,
        result_label: 'leads',
        active_campaigns: 3,
      }),
      google_snapshot: snapshot('google', {
        account_name: 'Imobiliária Litoral - Google',
        payment_type: 'unknown',
        balance: null,
        avg_daily_spend: 40,
        results_7d: 12,
        active_campaigns: 2,
      }),
      last_optimization_at: daysAgo(3),
    },
    {
      id: c.sorriso,
      name: 'Demo · Clínica Sorriso',
      tags: ['saude'],
      manager: 'Ana',
      meta_ad_account_id: '2345678901',
      google_ads_customer_id: '4445556666',
      result_metric: 'messages',
      balance_alert_threshold: 150,
      meta_snapshot: snapshot('meta', {
        account_name: 'Clínica Sorriso',
        balance: 1450,
        avg_daily_spend: 120,
        results_7d: 63,
        active_campaigns: 2,
      }),
      google_snapshot: snapshot('google', {
        account_name: 'Clínica Sorriso - Google',
        payment_type: 'account_budget',
        balance: 300,
        avg_daily_spend: 60,
        results_7d: 18.5,
        active_campaigns: 1,
      }),
      last_optimization_at: daysAgo(18),
    },
    {
      id: c.ferramentas,
      name: 'Demo · Loja de Ferramentas',
      tags: ['ecommerce', 'varejo'],
      manager: 'Luiz',
      meta_ad_account_id: '3456789012',
      result_metric: 'purchases',
      meta_snapshot: snapshot('meta', {
        account_name: 'Loja de Ferramentas',
        payment_type: 'postpaid',
        payment_label: 'Visa *4242',
        balance: null,
        avg_daily_spend: 70,
        spend_today: 0,
        spend_yesterday: 0,
        results_7d: 9,
        result_label: 'compras',
        active_campaigns: 4,
      }),
      last_optimization_at: daysAgo(35),
    },
    {
      id: c.fisio,
      name: 'Demo · Fisio Center',
      tags: ['saude', 'onboarding'],
      manager: 'Ana',
      meta_ad_account_id: '4567890123',
      meta_snapshot: {
        platform: 'meta',
        ok: false,
        checked_at: daysAgo(0, new Date().getHours()),
        error: 'Sem permissão nesta conta: adicione a conta de anúncios ao usuário do sistema no Business Manager.',
        error_code: 'api_error',
      },
      last_optimization_at: null,
    },
    {
      id: c.academia,
      name: 'Demo · Academia Move',
      tags: ['servicos'],
      manager: 'Luiz',
      google_ads_customer_id: '7778889999',
      google_snapshot: snapshot('google', {
        account_name: 'Academia Move',
        payment_type: 'account_budget',
        balance: 900,
        avg_daily_spend: 45,
        results_7d: 27,
        active_campaigns: 2,
      }),
      last_optimization_at: daysAgo(7),
    },
    {
      id: c.restaurante,
      name: 'Demo · Restaurante Maré',
      status: 'paused',
      tags: ['varejo'],
      manager: 'Ana',
      meta_ad_account_id: '5678901234',
      meta_snapshot: snapshot('meta', {
        account_name: 'Restaurante Maré',
        balance: 40,
        avg_daily_spend: 0,
        spend_today: 0,
        spend_yesterday: 0,
        results_7d: 0,
        active_campaigns: 0,
      }),
      last_optimization_at: daysAgo(60),
    },
  ].map((client) => ({ status: 'active', ...client, last_check_at: daysAgo(0, new Date().getHours()) }))

  // Histórico de 21 dias de saldo, com uma recarga no meio, pra o gráfico ter forma.
  const account_snapshots = []
  for (const client of clients) {
    for (const platform of ['meta', 'google']) {
      const s = client[`${platform}_snapshot`]
      if (!s?.ok || s.balance == null) continue
      const avg = s.avg_daily_spend || 50
      for (let d = 20; d >= 1; d--) {
        const topUp = d > 10 ? avg * 6 : 0
        const balance = Math.max(0, s.balance + avg * d - topUp + avg * 4)
        account_snapshots.push({
          client_id: client.id,
          platform,
          checked_at: daysAgo(d, 9),
          ok: true,
          balance: round(balance),
          spend_today: round(avg * 0.4),
          spend_yesterday: round(avg),
          spend_7d: round(avg * 7),
          results_7d: s.results_7d,
          active_campaigns: s.active_campaigns,
          data: null,
        })
      }
    }
  }

  const optimizations = [
    [c.litoral, 'meta', 'publico', 'Troquei o público aberto por lookalike 1% de leads qualificados.', 3],
    [c.litoral, 'google', 'palavras_chave', 'Negativei 14 termos de aluguel na campanha de venda.', 9],
    [c.sorriso, 'meta', 'criativos', 'Subi 3 criativos novos de implante (vídeo depoimento).', 18],
    [c.sorriso, 'google', 'lances', 'Mudei para Maximizar conversões com CPA desejado R$ 35.', 26],
    [c.ferramentas, 'meta', 'orcamento', 'Redistribuí verba para o catálogo Advantage+.', 35],
    [c.academia, 'google', 'estrutura', 'Separei campanha de marca da genérica.', 7],
    [c.restaurante, 'meta', 'pausa', 'Pausei tudo a pedido do cliente (reforma).', 60],
  ].map(([client_id, platform, category, description, ago]) => ({
    client_id,
    platform,
    category,
    description,
    performed_at: daysAgo(ago),
    created_by: 'Demo',
    created_at: daysAgo(ago),
  }))

  const pendencias = [
    { client_id: c.sorriso, title: 'Pedir fotos novas da recepção', due_date: dateOnly(2), assignee: 'Ana' },
    { client_id: c.sorriso, title: 'Conferir evento de conversa no GTM', due_date: dateOnly(-3), assignee: 'Luiz' },
    { client_id: c.fisio, title: 'Pedir acesso da conta de anúncios ao BM da Pipe', due_date: dateOnly(-1), assignee: 'Luiz' },
    { client_id: c.ferramentas, title: 'Revisar feed do catálogo (produtos sem estoque)', due_date: null, assignee: 'Ana' },
    {
      client_id: c.litoral,
      title: 'Enviar relatório mensal',
      status: 'done',
      done_at: daysAgo(2),
      due_date: dateOnly(-2),
      assignee: 'Luiz',
    },
  ].map((p) => ({ created_by: 'Demo', created_at: daysAgo(5), ...p }))

  const alerts = clients.flatMap((client) =>
    evaluateAlerts(client).map((a) => ({ client_id: client.id, ...a, created_at: daysAgo(0, 9) })),
  )

  const app_state = [
    { key: 'last_check', value: { at: daysAgo(0, new Date().getHours()), trigger: 'demo', checked: 5, errors: 1 } },
  ]

  return { clients, account_snapshots, optimizations, pendencias, alerts, app_state }
}
