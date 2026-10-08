// Listas fixas usadas em formulários e rótulos.

export const PLATFORMS = {
  meta: { label: 'Meta Ads', short: 'Meta' },
  google: { label: 'Google Ads', short: 'Google' },
  both: { label: 'Meta + Google', short: 'Ambos' },
  other: { label: 'Outro', short: 'Outro' },
}

export const OPTIMIZATION_CATEGORIES = [
  { id: 'criativos', label: 'Criativos' },
  { id: 'publico', label: 'Público / segmentação' },
  { id: 'orcamento', label: 'Orçamento / verba' },
  { id: 'lances', label: 'Lances / estratégia' },
  { id: 'palavras_chave', label: 'Palavras-chave / negativas' },
  { id: 'estrutura', label: 'Estrutura de campanha' },
  { id: 'pausa', label: 'Pausa / ativação' },
  { id: 'rastreamento', label: 'Rastreamento / pixel / LP' },
  { id: 'relatorio', label: 'Relatório / reunião' },
  { id: 'outro', label: 'Outro' },
]

const categoryById = new Map(OPTIMIZATION_CATEGORIES.map((c) => [c.id, c]))
export const categoryLabel = (id) => categoryById.get(id)?.label || id || 'Outro'

export const CLIENT_STATUS = {
  active: { label: 'Ativo' },
  paused: { label: 'Pausado' },
  churned: { label: 'Encerrado' },
}

export const RESULT_METRIC_OPTIONS = [
  { id: 'auto', label: 'Automático (conversas → leads → compras)' },
  { id: 'messages', label: 'Conversas no WhatsApp/Direct' },
  { id: 'leads', label: 'Leads (formulário/site)' },
  { id: 'purchases', label: 'Compras (e-commerce)' },
]

export const SEVERITY = {
  critical: { label: 'Crítico' },
  warning: { label: 'Atenção' },
  info: { label: 'Info' },
}

export const ALERT_TYPES = {
  balance_low: 'Saldo baixo',
  account_blocked: 'Conta bloqueada',
  no_delivery: 'Sem veiculação',
  integration_error: 'Falha na consulta',
}

export const BALANCE_SOURCE_LABEL = {
  prepaid: 'Saldo pré-pago',
  spend_cap: 'Restante do limite de gastos',
  account_budget: 'Restante do orçamento da conta',
}

// ----- CRM -----

// Etapas do funil, na ordem das colunas. won/lost ficam fora do quadro principal.
export const LEAD_STAGES = [
  { id: 'lead', label: 'Lead', hint: 'Chegou o contato' },
  { id: 'meeting', label: 'Reunião', hint: 'Diagnóstico marcado ou feito' },
  { id: 'proposal', label: 'Proposta enviada', hint: 'Aguardando retorno' },
  { id: 'negotiation', label: 'Negociação', hint: 'Ajustando escopo e valor' },
  { id: 'won', label: 'Fechado', hint: 'Virou cliente' },
  { id: 'lost', label: 'Perdido', hint: 'Não fechou' },
]
export const OPEN_STAGES = ['lead', 'meeting', 'proposal', 'negotiation']
const stageById = new Map(LEAD_STAGES.map((s) => [s.id, s]))
export const stageLabel = (id) => stageById.get(id)?.label || id

export const LEAD_SOURCES = ['Indicação', 'Instagram', 'Site', 'Google', 'Prospecção', 'Evento', 'Outro']
export const LOST_REASONS = ['Preço', 'Sem verba agora', 'Fechou com outra agência', 'Parou de responder', 'Faz internamente', 'Outro']

// Tipos de registro na linha do tempo. "note" é interna: não conta como contato.
export const INTERACTION_KINDS = [
  { id: 'meeting', label: 'Reunião' },
  { id: 'call', label: 'Ligação' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'email', label: 'E-mail' },
  { id: 'report', label: 'Relatório enviado' },
  { id: 'complaint', label: 'Reclamação' },
  { id: 'praise', label: 'Elogio' },
  { id: 'note', label: 'Nota interna' },
]
const kindById = new Map(INTERACTION_KINDS.map((k) => [k.id, k]))
export const kindLabel = (id) => kindById.get(id)?.label || id

export const LINK_FIELDS = [
  { key: 'site', label: 'Site', placeholder: 'empresa.com.br' },
  { key: 'instagram', label: 'Instagram', placeholder: '@perfil' },
  { key: 'drive', label: 'Pasta no Drive', placeholder: 'https://drive.google.com/…' },
  { key: 'gtm', label: 'GTM / rastreamento', placeholder: 'https://tagmanager.google.com/…' },
  { key: 'proposta', label: 'Proposta comercial', placeholder: 'https://…' },
  { key: 'outro', label: 'Outro link', placeholder: 'https://…' },
]

// Relatórios e análises (publicados pela equipe ou pelo agente Hermes).
export const REPORT_KINDS = [
  { id: 'report', label: 'Relatório' },
  { id: 'analysis', label: 'Análise' },
  { id: 'daily', label: 'Resumo do dia' },
]
const reportKindById = new Map(REPORT_KINDS.map((k) => [k.id, k]))
export const reportKindLabel = (id) => reportKindById.get(id)?.label || id

// O que a Pipe vende (mesma lista de lib/services.js no backend).
export const SERVICES = [
  { id: 'meta_ads', label: 'Meta Ads', short: 'Meta' },
  { id: 'google_ads', label: 'Google Ads', short: 'Google' },
  { id: 'paginas', label: 'Páginas e sites', short: 'Páginas' },
  { id: 'automacao', label: 'IA e automação', short: 'IA' },
  { id: 'dados', label: 'Rastreamento e dados', short: 'Dados' },
  { id: 'criativos', label: 'Criativos', short: 'Criativos' },
]
export const serviceLabel = (id, short = false) => {
  const s = SERVICES.find((x) => x.id === id)
  return s ? (short ? s.short : s.label) : id
}

// Briefing do cliente: o que qualquer pessoa da equipe precisa saber antes de mexer.
export const BRIEFING_FIELDS = [
  { key: 'objetivo', label: 'Objetivo principal', placeholder: 'Ex.: conversas no WhatsApp para implantes', rows: 2 },
  { key: 'oferta', label: 'Oferta / produtos', placeholder: 'O que vendemos nos anúncios', rows: 2 },
  { key: 'publico', label: 'Público', placeholder: 'Quem compra: idade, região, perfil', rows: 2 },
  { key: 'diferenciais', label: 'Diferenciais', placeholder: 'Por que escolher esse cliente', rows: 2 },
  { key: 'tom', label: 'Tom de voz', placeholder: 'Ex.: acolhedor, direto, sem gírias', rows: 1 },
  { key: 'regras', label: 'Regras obrigatórias', placeholder: 'O que NUNCA pode / SEMPRE deve aparecer (ex.: CRO, sem "avaliação gratuita")', rows: 3 },
  { key: 'concorrentes', label: 'Concorrentes', placeholder: 'Nomes ou @ para olhar na Biblioteca de Anúncios', rows: 1 },
  { key: 'observacoes', label: 'Observações', placeholder: 'Combinados, sazonalidade, histórico importante', rows: 2 },
]

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
