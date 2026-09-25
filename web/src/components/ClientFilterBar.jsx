// Barra de busca + Filtrar + Ordenar + chips de etiqueta, igual em toda tela
// que lista clientes. Os valores ficam no estado da página (e lembrados no
// navegador); a lógica em si mora em lib/clientFilters.js.
import { Search, X } from 'lucide-react'
import { CLIENT_FILTERS, CLIENT_SORTS } from '../lib/clientFilters.js'
import { CLIENT_TAGS } from '../lib/tags.js'
import { TagChip } from './ui.jsx'

// `defaults`: o estado "sem filtro" da página (o Painel começa em Ativos, a
// página Clientes em Todos); o "limpar" só aparece quando algo difere dele.
export default function ClientFilterBar({ state, onChange, total, shown, showSort = true, defaults = DEFAULT_FILTER_STATE }) {
  const set = (patch) => onChange({ ...state, ...patch })
  const toggleTag = (id) =>
    set({ tags: state.tags.includes(id) ? state.tags.filter((t) => t !== id) : [...state.tags, id] })
  const hasActive = state.search || state.tags.length > 0 || state.filter !== defaults.filter

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            className="input pl-9"
            placeholder="Buscar cliente ou ID da conta…"
            value={state.search}
            onChange={(e) => set({ search: e.target.value })}
            aria-label="Buscar cliente"
          />
        </div>
        <div className="flex gap-2">
          <select
            className="input sm:w-56"
            value={state.filter}
            onChange={(e) => set({ filter: e.target.value })}
            aria-label="Filtrar clientes"
          >
            {CLIENT_FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          {showSort && (
            <select
              className="input sm:w-56"
              value={state.sort}
              onChange={(e) => set({ sort: e.target.value })}
              aria-label="Ordenar clientes"
            >
              {CLIENT_SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {CLIENT_TAGS.map((t) => (
          <TagChip key={t.id} id={t.id} selected={state.tags.includes(t.id)} onClick={() => toggleTag(t.id)} />
        ))}
        <span className="muted ml-auto flex items-center gap-2 pl-2 text-xs">
          <span className="tabular">
            {shown} de {total} clientes
          </span>
          {hasActive && (
            <button
              type="button"
              className="inline-flex items-center gap-0.5 font-semibold text-brand-600 hover:underline dark:text-slate-300"
              onClick={() => onChange({ ...state, search: '', tags: [], filter: defaults.filter })}
            >
              <X className="h-3 w-3" /> limpar
            </button>
          )}
        </span>
      </div>
    </div>
  )
}

export const DEFAULT_FILTER_STATE = { search: '', filter: 'active', sort: 'urgency', tags: [] }
