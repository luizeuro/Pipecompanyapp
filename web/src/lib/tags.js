// Catálogo de etiquetas dos clientes. Pra criar uma etiqueta nova, é só
// adicionar uma linha aqui: ela aparece no formulário do cliente e nos chips
// de filtro de todas as telas.
export const CLIENT_TAGS = [
  { id: 'prioridade', label: 'Prioridade', color: 'rose' },
  { id: 'onboarding', label: 'Onboarding', color: 'sky' },
  { id: 'imobiliaria', label: 'Imobiliária', color: 'amber' },
  { id: 'saude', label: 'Saúde', color: 'emerald' },
  { id: 'ecommerce', label: 'E-commerce', color: 'violet' },
  { id: 'varejo', label: 'Varejo', color: 'orange' },
  { id: 'servicos', label: 'Serviços', color: 'teal' },
  { id: 'google', label: 'Foco Google', color: 'blue' },
]

// Strings completas por cor (o Tailwind não gera classe montada dinamicamente).
export const TAG_COLOR_CLASSES = {
  rose: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/30',
  sky: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/30',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/30',
  orange: 'bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-400/30',
  teal: 'bg-teal-50 text-teal-700 ring-teal-600/20 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-400/30',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/30',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600/40',
}

const byId = new Map(CLIENT_TAGS.map((t) => [t.id, t]))

// Etiqueta que não está mais no catálogo continua aparecendo (em cinza), pra
// não sumir informação de cliente antigo.
export function getTag(id) {
  return byId.get(id) || { id, label: id, color: 'slate' }
}
