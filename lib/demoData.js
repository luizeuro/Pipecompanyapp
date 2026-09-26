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

  // ----- CRM de demonstração -----

  // Contrato/ficha: honorários e datas variados, pra tela de Números ter forma.
  const contract = {
    [c.litoral]: { segment: 'Imobiliária', city: 'Guarujá', fee_monthly: 2200, contract_start: dateOnly(-240), billing_day: 10, renewal_date: dateOnly(18) },
    [c.sorriso]: { segment: 'Odontologia', city: 'São Paulo', fee_monthly: 1500, contract_start: dateOnly(-150), billing_day: 5, renewal_date: dateOnly(120) },
    [c.ferramentas]: { segment: 'Varejo de ferramentas', city: 'Guarujá', fee_monthly: 1800, contract_start: dateOnly(-95), billing_day: 15 },
    [c.fisio]: { segment: 'Fisioterapia', city: 'Guarujá', fee_monthly: 1200, contract_start: dateOnly(-12), billing_day: 20 },
    [c.academia]: { segment: 'Academia', city: 'Santos', fee_monthly: 1600, contract_start: dateOnly(-60), billing_day: new Date().getDate() + 2 > 28 ? 1 : new Date().getDate() + 2 },
    [c.restaurante]: { segment: 'Restaurante', city: 'Guarujá', fee_monthly: 1000, contract_start: dateOnly(-200) },
  }
  const links = {
    [c.litoral]: { site: 'imobiliarialitoral.demo', instagram: '@imobiliarialitoral.demo', drive: 'https://drive.google.com/demo' },
    [c.sorriso]: { site: 'clinicasorriso.demo', instagram: '@clinicasorriso.demo' },
  }
  for (const client of clients) {
    Object.assign(client, contract[client.id] || {}, { links: links[client.id] || {} })
  }
  // Cliente encerrado neste mês (métrica de cancelamento).
  clients.push({
    id: id(),
    name: 'Demo · Pet Shop Onda',
    status: 'churned',
    tags: ['varejo'],
    manager: 'Ana',
    segment: 'Pet shop',
    city: 'Santos',
    fee_monthly: 1100,
    contract_start: dateOnly(-180),
    churned_at: daysAgo(Math.min(5, new Date().getDate() - 1 || 0)),
    last_optimization_at: daysAgo(40),
    links: {},
  })

  const contacts = [
    { client_id: c.litoral, name: 'Marcos (sócio)', role: 'Sócio-diretor', phone: '(13) 99999-0001', is_decision_maker: true },
    { client_id: c.litoral, name: 'Júlia', role: 'Marketing', email: 'julia@imobiliarialitoral.demo' },
    { client_id: c.sorriso, name: 'Dra. Paula', role: 'Dona da clínica', phone: '(11) 98888-0002', is_decision_maker: true },
    { client_id: c.ferramentas, name: 'Sr. Roberto', role: 'Proprietário', phone: '(13) 97777-0003', is_decision_maker: true },
    { client_id: c.academia, name: 'Carla', role: 'Gerente', phone: '(13) 96666-0004', is_decision_maker: true },
  ]

  // Linha do tempo: último contato em faixas diferentes da régua + follow-ups
  // atrasado, de hoje e da semana, pra tela Hoje ter o que mostrar.
  const interactions = [
    { client_id: c.litoral, kind: 'meeting', summary: 'Reunião mensal: aprovaram verba extra para o lançamento do Residencial Mar Azul.', happened_at: daysAgo(4), next_step: 'Enviar criativos do lançamento para aprovação', next_step_at: dateOnly(0) },
    { client_id: c.litoral, kind: 'report', summary: 'Relatório de agosto enviado no WhatsApp.', happened_at: daysAgo(26) },
    { client_id: c.sorriso, kind: 'whatsapp', summary: 'Dra. Paula perguntou por que caíram as conversas na semana passada.', happened_at: daysAgo(19), next_step: 'Ligar explicando a troca de público', next_step_at: dateOnly(-2) },
    { client_id: c.ferramentas, kind: 'complaint', summary: 'Reclamou que as vendas do site não aparecem no relatório.', happened_at: daysAgo(33) },
    { client_id: c.academia, kind: 'call', summary: 'Alinhamento da campanha de matrícula de outubro.', happened_at: daysAgo(6), next_step: 'Mandar proposta de verba para a Black Friday', next_step_at: dateOnly(4) },
    { client_id: c.academia, kind: 'praise', summary: 'Carla elogiou o volume de matrículas pelo Google.', happened_at: daysAgo(9) },
    { client_id: c.litoral, kind: 'note', summary: 'Nota interna: cliente prefere contato à tarde.', happened_at: daysAgo(1) },
  ].map((i) => ({ created_by: 'Demo', ...i }))
  const lastContact = new Map()
  for (const i of interactions) {
    if (i.kind === 'note') continue
    if (!lastContact.has(i.client_id) || i.happened_at > lastContact.get(i.client_id)) lastContact.set(i.client_id, i.happened_at)
  }
  for (const client of clients) client.last_contact_at = lastContact.get(client.id) || null

  // Funil: um cartão por etapa, mais fechados e perdidos recentes (taxa de fechamento).
  const lead = (over) => ({ owner: 'Luiz', created_by: 'Demo', created_at: daysAgo(20), updated_at: daysAgo(2), stage_changed_at: daysAgo(3), ...over })
  const leads = [
    lead({ company: 'Demo · Clínica Estética Bela', contact_name: 'Renata', contact_phone: '(13) 95555-0101', source: 'Indicação', segment: 'Estética', stage: 'lead', next_step: 'Primeiro contato pelo WhatsApp', next_step_at: dateOnly(0) }),
    lead({ company: 'Demo · Construtora Horizonte', contact_name: 'Eduardo', source: 'Instagram', segment: 'Construção', stage: 'meeting', fee_proposed: 2500, next_step: 'Reunião de diagnóstico', next_step_at: dateOnly(1), owner: 'Ana' }),
    lead({ company: 'Demo · Loja Surf Point', contact_name: 'Bruno', instagram: '@surfpoint.demo', source: 'Prospecção', segment: 'E-commerce', stage: 'proposal', fee_proposed: 2000, media_budget: 3000, proposal_url: 'https://exemplo.demo/proposta', next_step: 'Cobrar retorno da proposta', next_step_at: dateOnly(-1) }),
    lead({ company: 'Demo · Escola Idiomas Plus', contact_name: 'Sandra', source: 'Site', segment: 'Educação', stage: 'negotiation', fee_proposed: 1800, media_budget: 2500, next_step: 'Ajustar escopo sem Google Ads', next_step_at: dateOnly(3) }),
    lead({ company: 'Demo · Hamburgueria Brasa', source: 'Indicação', segment: 'Restaurante', stage: 'lead' }),
    lead({ company: 'Demo · Ótica Visão', source: 'Instagram', stage: 'lost', fee_proposed: 1500, lost_reason: 'Preço', lost_at: daysAgo(12), stage_changed_at: daysAgo(12) }),
    lead({ company: 'Demo · Academia Move', source: 'Indicação', stage: 'won', fee_proposed: 1600, won_at: daysAgo(60), stage_changed_at: daysAgo(60), client_id: c.academia }),
    lead({ company: 'Demo · Fisio Center', source: 'Site', stage: 'won', fee_proposed: 1200, won_at: daysAgo(12), stage_changed_at: daysAgo(12), client_id: c.fisio }),
  ]

  return { clients, account_snapshots, optimizations, pendencias, alerts, app_state, contacts, interactions, leads }
}
