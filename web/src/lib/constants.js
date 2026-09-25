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
