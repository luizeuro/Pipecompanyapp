// Servidor MCP do CRM: as "ferramentas" que um agente (Hermes Agent, Claude...)
// usa pra ler e alimentar o CRM da Pipe. Exposto em POST /api/mcp (Streamable
// HTTP, sem sessão — combina com função serverless). Toda ferramenta chama as
// mesmas funções de lib/crm.js que a tela usa: o agente nunca tem uma regra
// diferente da equipe. O que o agente grava sai assinado "<nome> (agente)".
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import * as crm from './crm.js'

const INSTRUCTIONS = `CRM da Pipe Company (agência de tráfego pago em Guarujá/SP). Tudo em português do Brasil.
- Clientes podem ser citados pelo nome (ou parte dele) ou pelo ID. Datas no formato AAAA-MM-DD.
- "Tarefa" = pendência do cliente. Antes de criar tarefa, confira as abertas (listar_tarefas) pra não duplicar.
- Saúde do cliente: nota 0-100 (Saudável 75+, Atenção 50-74, Em risco <50) com motivos.
- Saldo: "critical" = dura menos de 3 dias ou abaixo do mínimo; "warn" = menos de 7 dias.
- Relatórios e análises vão para o CRM com publicar_relatorio (conteúdo em Markdown).
- Não invente números: use só o que as ferramentas devolvem; se faltar dado, diga que falta.`

const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 1) }] })
// Argumento opcional não enviado chega como undefined; tira do objeto pra
// validação do CRM não confundir "não informado" com "valor inválido".
const defined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))
const fail = (err) => ({ isError: true, content: [{ type: 'text', text: `Erro: ${err.message}` }] })

function platformSummary(s) {
  if (!s) return null
  if (!s.ok) return { erro: s.error }
  return {
    status: s.status_label,
    saldo: s.balance,
    dias_de_saldo: s.days_left,
    gasto_hoje: s.spend_today,
    gasto_ontem: s.spend_yesterday,
    gasto_7d: s.spend_7d,
    media_diaria: s.avg_daily_spend,
    resultados_7d: s.results_7d,
    tipo_resultado: s.result_label,
    custo_por_resultado: s.cost_per_result,
    campanhas_ativas: s.active_campaigns,
    verificado_em: s.checked_at,
  }
}

// Resumo enxuto de cliente (menos texto pro agente = menos custo e menos erro).
function clientSummary(c) {
  return {
    id: c.id,
    nome: c.name,
    situacao: c.status,
    etiquetas: c.tags,
    responsavel: c.manager,
    segmento: c.segment,
    honorario_mensal: c.fee_monthly,
    verba_midia_mensal: c.monthly_budget,
    saude: c.health ? { nota: c.health.score, nivel: c.health.label, motivos: c.health.reasons } : null,
    ultimo_contato: c.last_contact_at,
    ultima_otimizacao: c.last_optimization_at,
    pendencias_abertas: c.open_pendencias_count,
    pendencias_atrasadas: c.overdue_pendencias_count,
    alertas_abertos: c.open_alerts_count,
    nivel_saldo: c.balance_level,
    gasto_7d_total: c.spend_7d_total,
    meta_ads: platformSummary(c.meta_snapshot),
    google_ads: platformSummary(c.google_snapshot),
  }
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use AAAA-MM-DD')
const OPT_CATEGORIES = ['criativos', 'publico', 'orcamento', 'lances', 'palavras_chave', 'estrutura', 'pausa', 'rastreamento', 'relatorio', 'outro']
const REPORT_TYPE = { relatorio: 'report', analise: 'analysis', resumo_diario: 'daily' }
const REPORT_TYPE_BACK = Object.fromEntries(Object.entries(REPORT_TYPE).map(([k, v]) => [v, k]))

export function buildMcpServer(actor) {
  const server = new McpServer({ name: 'pipe-crm', version: '1.0.0' }, { instructions: INSTRUCTIONS })
  const canWrite = actor.scope !== 'read'
  const read = (fn) => async (args) => {
    try {
      return ok(await fn(args || {}))
    } catch (err) {
      return fail(err)
    }
  }
  const write = (fn) => async (args) => {
    if (!canWrite) return fail(new Error('Esta chave de API é só de leitura.'))
    try {
      return ok(await fn(args || {}))
    } catch (err) {
      return fail(err)
    }
  }
  const RO = { readOnlyHint: true, openWorldHint: false }
  const RW = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }

  // ----- Leitura -----

  server.registerTool(
    'listar_clientes',
    {
      title: 'Listar clientes',
      description:
        'Lista os clientes da Pipe com saúde (nota e motivos), honorário, último contato, última otimização, pendências, alertas e o resumo das contas Meta/Google (saldo, dias de saldo, gasto, resultados).',
      inputSchema: {
        situacao: z.enum(['ativos', 'pausados', 'encerrados', 'todos']).optional().describe('Padrão: ativos'),
        filtro: z.enum(['todos', 'em_risco', 'sem_contato', 'saldo_acabando', 'com_pendencias']).optional(),
        busca: z.string().optional().describe('Parte do nome do cliente'),
      },
      annotations: RO,
    },
    read(async ({ situacao = 'ativos', filtro = 'todos', busca }) => {
      const status = { ativos: 'active', pausados: 'paused', encerrados: 'churned' }[situacao]
      let list = await crm.listClients()
      if (status) list = list.filter((c) => c.status === status)
      if (busca) list = list.filter((c) => c.name.toLowerCase().includes(busca.toLowerCase()))
      const days = (d) => (d ? (Date.now() - new Date(d).getTime()) / 864e5 : Infinity)
      if (filtro === 'em_risco') list = list.filter((c) => c.health && c.health.level !== 'ok')
      if (filtro === 'sem_contato') list = list.filter((c) => days(c.last_contact_at) > 14)
      if (filtro === 'saldo_acabando') list = list.filter((c) => ['critical', 'warn'].includes(c.balance_level))
      if (filtro === 'com_pendencias') list = list.filter((c) => c.open_pendencias_count > 0)
      return { total: list.length, clientes: list.map(clientSummary) }
    }),
  )

  server.registerTool(
    'ver_cliente',
    {
      title: 'Ver ficha do cliente',
      description:
        'Ficha completa de um cliente: contrato, contatos, contas de anúncio, últimas interações e otimizações, pendências e alertas abertos e os últimos relatórios.',
      inputSchema: { cliente: z.string().describe('Nome (ou parte) ou ID do cliente') },
      annotations: RO,
    },
    read(async ({ cliente }) => {
      const ref = await crm.resolveClient(cliente)
      const d = await crm.getClientDetail(ref.id)
      return {
        cliente: {
          ...clientSummary(d.client),
          cidade: d.client.city,
          cliente_desde: d.client.contract_start,
          renovacao: d.client.renewal_date,
          dia_cobranca: d.client.billing_day,
          links: d.client.links,
          observacoes: d.client.notes,
        },
        contatos: d.contacts.map((c) => ({ nome: c.name, cargo: c.role, telefone: c.phone, email: c.email, decide: c.is_decision_maker })),
        linha_do_tempo: d.interactions.slice(0, 15).map((i) => ({
          data: i.happened_at, tipo: i.kind, resumo: i.summary, por: i.created_by,
          proximo_passo: i.next_step, proximo_passo_data: i.next_step_at, proximo_passo_feito: i.next_step_done,
        })),
        otimizacoes: d.optimizations.slice(0, 10).map((o) => ({ data: o.performed_at, plataforma: o.platform, categoria: o.category, descricao: o.description, por: o.created_by })),
        pendencias_abertas: d.pendencias.filter((p) => p.status === 'open').map((p) => ({ id: p.id, titulo: p.title, prazo: p.due_date, responsavel: p.assignee })),
        alertas_abertos: d.alerts.filter((a) => !a.resolved_at).map((a) => ({ plataforma: a.platform, gravidade: a.severity, mensagem: a.message, desde: a.created_at })),
        relatorios_recentes: d.reports.slice(0, 3).map((r) => ({ id: r.id, tipo: REPORT_TYPE_BACK[r.kind], titulo: r.title, publicado_em: r.created_at, por: r.created_by })),
      }
    }),
  )

  server.registerTool(
    'desempenho_contas',
    {
      title: 'Desempenho das contas de anúncio',
      description:
        'Histórico das verificações das contas Meta/Google de um cliente (saldo, gasto de ontem, gasto e resultados dos últimos 7 dias, campanhas ativas), pra analisar tendência.',
      inputSchema: { cliente: z.string(), dias: z.number().int().min(1).max(90).optional().describe('Padrão: 14') },
      annotations: RO,
    },
    read(async ({ cliente, dias = 14 }) => {
      const ref = await crm.resolveClient(cliente)
      const { client, snapshots } = await crm.getAccountHistory(ref.id, dias)
      return {
        cliente: client.name,
        atual: { meta_ads: platformSummary(client.meta_snapshot), google_ads: platformSummary(client.google_snapshot) },
        historico: snapshots.map((s) => ({
          data: s.checked_at, plataforma: s.platform, ok: s.ok, saldo: s.balance, gasto_ontem: s.spend_yesterday,
          gasto_7d: s.spend_7d, resultados_7d: s.results_7d, campanhas_ativas: s.active_campaigns,
        })),
      }
    }),
  )

  server.registerTool(
    'agenda_hoje',
    {
      title: 'Agenda do dia',
      description:
        'O que a Pipe precisa fazer: follow-ups, próximos passos do funil e tarefas (atrasados, hoje, próximos 7 dias), clientes em risco, sem contato há 15+ dias, saldo acabando e renovações em 30 dias.',
      inputSchema: {},
      annotations: RO,
    },
    read(() => crm.getAgenda()),
  )

  server.registerTool(
    'funil_comercial',
    {
      title: 'Funil comercial',
      description: 'Leads por etapa (lead, meeting, proposal, negotiation), com honorário proposto, próximo passo e data da última interação.',
      inputSchema: { incluir_fechados: z.boolean().optional().describe('Inclui ganhos e perdidos. Padrão: não') },
      annotations: RO,
    },
    read(async ({ incluir_fechados = false }) => {
      const leads = await crm.listLeads()
      const list = incluir_fechados ? leads : leads.filter((l) => crm.OPEN_STAGES.includes(l.stage))
      return list.map((l) => ({
        id: l.id, empresa: l.company, etapa: l.stage, contato: l.contact_name, origem: l.source, responsavel: l.owner,
        honorario_proposto: l.fee_proposed, verba: l.media_budget, proximo_passo: l.next_step, proximo_passo_data: l.next_step_at,
        ultima_interacao: l.last_interaction_at, motivo_perda: l.lost_reason,
      }))
    }),
  )

  server.registerTool(
    'ver_lead',
    {
      title: 'Ver lead',
      description: 'Detalhes de um lead do funil e o histórico de conversas.',
      inputSchema: { lead_id: z.string() },
      annotations: RO,
    },
    read(({ lead_id }) => crm.getLead(lead_id)),
  )

  server.registerTool(
    'numeros_agencia',
    {
      title: 'Números da agência',
      description:
        'Receita mensal recorrente (e últimos 6 meses), ticket médio, verba sob gestão, saúde da carteira, receita por responsável, cancelamentos do mês e funil dos últimos 90 dias.',
      inputSchema: {},
      annotations: RO,
    },
    read(() => crm.getMetrics()),
  )

  server.registerTool(
    'listar_tarefas',
    {
      title: 'Listar tarefas',
      description: 'Tarefas (pendências) dos clientes. Use antes de criar tarefa, pra não duplicar.',
      inputSchema: { cliente: z.string().optional(), situacao: z.enum(['abertas', 'concluidas', 'todas']).optional().describe('Padrão: abertas') },
      annotations: RO,
    },
    read(async ({ cliente, situacao = 'abertas' }) => {
      const clientId = cliente ? (await crm.resolveClient(cliente)).id : undefined
      const status = { abertas: 'open', concluidas: 'done' }[situacao]
      const rows = await crm.listPendencias({ status, clientId })
      return rows.map((p) => ({ id: p.id, cliente: p.client_name, titulo: p.title, detalhes: p.description, prazo: p.due_date, responsavel: p.assignee, situacao: p.status, criada_por: p.created_by }))
    }),
  )

  server.registerTool(
    'listar_relatorios',
    {
      title: 'Listar relatórios',
      description: 'Relatórios e análises já publicados no CRM (de um cliente ou gerais), com o conteúdo em Markdown.',
      inputSchema: {
        cliente: z.string().optional(),
        tipo: z.enum(['relatorio', 'analise', 'resumo_diario']).optional(),
        limite: z.number().int().min(1).max(50).optional().describe('Padrão: 10'),
      },
      annotations: RO,
    },
    read(async ({ cliente, tipo, limite = 10 }) => {
      const clientId = cliente ? (await crm.resolveClient(cliente)).id : undefined
      const rows = await crm.listReports({ clientId, kind: tipo ? REPORT_TYPE[tipo] : undefined, limit: limite })
      return rows.map((r) => ({ id: r.id, cliente: r.client_name, tipo: REPORT_TYPE_BACK[r.kind], titulo: r.title, periodo: [r.period_start, r.period_end], publicado_em: r.created_at, por: r.created_by, conteudo: r.content }))
    }),
  )

  // ----- Escrita -----

  server.registerTool(
    'criar_tarefa',
    {
      title: 'Criar tarefa',
      description: 'Cria uma tarefa (pendência) para um cliente. Confira antes com listar_tarefas se já não existe uma igual aberta.',
      inputSchema: {
        cliente: z.string(),
        titulo: z.string().max(200),
        detalhes: z.string().optional(),
        prazo: dateSchema.optional(),
        responsavel: z.string().optional().describe('Nome de quem da equipe vai fazer'),
      },
      annotations: RW,
    },
    write(async ({ cliente, titulo, detalhes, prazo, responsavel }) => {
      const ref = await crm.resolveClient(cliente)
      const row = await crm.createPendencia(defined({ client_id: ref.id, title: titulo, description: detalhes, due_date: prazo, assignee: responsavel }), actor)
      return { criada: true, id: row.id, cliente: ref.name, titulo: row.title, prazo: row.due_date }
    }),
  )

  server.registerTool(
    'concluir_tarefa',
    {
      title: 'Concluir tarefa',
      description: 'Marca uma tarefa (pendência) como concluída.',
      inputSchema: { tarefa_id: z.string() },
      annotations: RW,
    },
    write(async ({ tarefa_id }) => {
      const row = await crm.updatePendencia(tarefa_id, { status: 'done' })
      return { concluida: true, id: row.id, titulo: row.title }
    }),
  )

  server.registerTool(
    'registrar_contato',
    {
      title: 'Registrar contato',
      description:
        'Registra na linha do tempo uma conversa com cliente ou lead (reunião, ligação, WhatsApp, e-mail, relatório enviado, reclamação, elogio ou nota interna). O próximo passo com data vira follow-up na agenda.',
      inputSchema: {
        cliente: z.string().optional().describe('Nome ou ID do cliente (ou use lead_id)'),
        lead_id: z.string().optional(),
        tipo: z.enum(['meeting', 'call', 'whatsapp', 'email', 'report', 'complaint', 'praise', 'note']),
        resumo: z.string(),
        data: dateSchema.optional().describe('Padrão: hoje'),
        proximo_passo: z.string().optional(),
        proximo_passo_data: dateSchema.optional(),
      },
      annotations: RW,
    },
    write(async ({ cliente, lead_id, tipo, resumo, data, proximo_passo, proximo_passo_data }) => {
      if (!cliente && !lead_id) throw new Error('Informe o cliente ou o lead_id.')
      const ref = cliente ? await crm.resolveClient(cliente) : null
      const row = await crm.createInteraction(
        defined({ client_id: ref?.id, lead_id, kind: tipo, summary: resumo, happened_at: data, next_step: proximo_passo, next_step_at: proximo_passo_data }),
        actor,
      )
      return { registrado: true, id: row.id, cliente: ref?.name, proximo_passo: row.next_step, proximo_passo_data: row.next_step_at }
    }),
  )

  server.registerTool(
    'registrar_otimizacao',
    {
      title: 'Registrar otimização',
      description: 'Registra uma otimização feita na conta de anúncio de um cliente (zera a régua de dias sem otimização).',
      inputSchema: {
        cliente: z.string(),
        plataforma: z.enum(['meta', 'google', 'both', 'other']),
        categoria: z.enum(OPT_CATEGORIES),
        descricao: z.string(),
        data: dateSchema.optional(),
      },
      annotations: RW,
    },
    write(async ({ cliente, plataforma, categoria, descricao, data }) => {
      const ref = await crm.resolveClient(cliente)
      const row = await crm.createOptimization(defined({ client_id: ref.id, platform: plataforma, category: categoria, description: descricao, performed_at: data }), actor)
      return { registrada: true, id: row.id, cliente: ref.name }
    }),
  )

  server.registerTool(
    'publicar_relatorio',
    {
      title: 'Publicar relatório ou análise',
      description:
        'Publica no CRM um relatório (ex: semanal do cliente), uma análise (ex: problemas nas contas) ou o resumo diário da agência. Sem cliente = relatório geral da agência. Conteúdo em Markdown.',
      inputSchema: {
        cliente: z.string().optional(),
        tipo: z.enum(['relatorio', 'analise', 'resumo_diario']),
        titulo: z.string().max(200),
        conteudo_markdown: z.string(),
        periodo_inicio: dateSchema.optional(),
        periodo_fim: dateSchema.optional(),
      },
      annotations: RW,
    },
    write(async ({ cliente, tipo, titulo, conteudo_markdown, periodo_inicio, periodo_fim }) => {
      const ref = cliente ? await crm.resolveClient(cliente) : null
      const row = await crm.createReport(
        defined({ client_id: ref?.id, kind: REPORT_TYPE[tipo], title: titulo, content: conteudo_markdown, period_start: periodo_inicio, period_end: periodo_fim }),
        actor,
      )
      return { publicado: true, id: row.id, cliente: ref?.name || 'Agência (geral)', titulo: row.title }
    }),
  )

  server.registerTool(
    'criar_lead',
    {
      title: 'Criar lead',
      description: 'Adiciona um lead novo ao funil comercial.',
      inputSchema: {
        empresa: z.string(),
        contato: z.string().optional(),
        telefone: z.string().optional(),
        email: z.string().optional(),
        instagram: z.string().optional(),
        segmento: z.string().optional(),
        origem: z.enum(['Indicação', 'Instagram', 'Site', 'Google', 'Prospecção', 'Evento', 'Outro']).optional(),
        etapa: z.enum(['lead', 'meeting', 'proposal', 'negotiation']).optional(),
        honorario_proposto: z.number().optional(),
        verba: z.number().optional(),
        proximo_passo: z.string().optional(),
        proximo_passo_data: dateSchema.optional(),
        observacoes: z.string().optional(),
      },
      annotations: RW,
    },
    write(async (a) => {
      const row = await crm.createLead(
        defined({
          company: a.empresa, contact_name: a.contato, contact_phone: a.telefone, contact_email: a.email, instagram: a.instagram,
          segment: a.segmento, source: a.origem, stage: a.etapa, fee_proposed: a.honorario_proposto, media_budget: a.verba,
          next_step: a.proximo_passo, next_step_at: a.proximo_passo_data, notes: a.observacoes,
        }),
        actor,
      )
      return { criado: true, id: row.id, empresa: row.company, etapa: row.stage }
    }),
  )

  server.registerTool(
    'atualizar_lead',
    {
      title: 'Atualizar lead',
      description:
        'Muda etapa, próximo passo ou observações de um lead. Etapa "lost" exige motivo_perda. Fechar contrato (virar cliente) é só pela equipe, na tela.',
      inputSchema: {
        lead_id: z.string(),
        etapa: z.enum(['lead', 'meeting', 'proposal', 'negotiation', 'lost']).optional(),
        proximo_passo: z.string().optional(),
        proximo_passo_data: dateSchema.optional(),
        observacoes: z.string().optional(),
        motivo_perda: z.string().optional(),
      },
      annotations: RW,
    },
    write(async ({ lead_id, etapa, proximo_passo, proximo_passo_data, observacoes, motivo_perda }) => {
      if (etapa === 'lost' && !motivo_perda) throw new Error('Informe motivo_perda para marcar como perdido.')
      const body = {}
      if (etapa) body.stage = etapa
      if (proximo_passo !== undefined) body.next_step = proximo_passo
      if (proximo_passo_data !== undefined) body.next_step_at = proximo_passo_data
      if (observacoes !== undefined) body.notes = observacoes
      if (motivo_perda !== undefined) body.lost_reason = motivo_perda
      const row = await crm.updateLead(lead_id, body)
      return { atualizado: true, id: row.id, empresa: row.company, etapa: row.stage, proximo_passo: row.next_step, proximo_passo_data: row.next_step_at }
    }),
  )

  return server
}
