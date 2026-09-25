// Otimizações: registro de tudo que a equipe mexeu nas contas, com a régua de
// "última otimização por cliente" ao lado pra ver quem está ficando pra trás.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { api } from '../lib/api.js'
import { useData } from '../lib/data.jsx'
import { usePersistentState } from '../lib/usePersistentState.js'
import { categoryLabel, OPTIMIZATION_CATEGORIES, PLATFORMS } from '../lib/constants.js'
import { dateBR, normalizeSearch } from '../lib/format.js'
import { applyClientSort } from '../lib/clientFilters.js'
import OptimizationForm from '../components/OptimizationForm.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { useToast } from '../components/Toast.jsx'
import { EmptyState, OptimizationBadge, PageHeader, PlatformBadge, Spinner } from '../components/ui.jsx'

export default function Optimizations() {
  const { clients, refresh } = useData()
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const [filters, setFilters] = usePersistentState('pc-filters-opts', { client: '', platform: '', category: '', search: '' })
  const [modal, setModal] = useState(null)

  const load = useCallback(async () => {
    try {
      const { optimizations } = await api('/optimizations?limit=1000')
      setRows(optimizations)
    } catch (err) {
      toast(err.message, 'error')
      setRows([])
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const reloadAll = () => Promise.all([load(), refresh()])

  const shown = useMemo(() => {
    if (!rows) return []
    const q = normalizeSearch(filters.search)
    return rows.filter(
      (o) =>
        (!filters.client || o.client_id === filters.client) &&
        (!filters.platform || o.platform === filters.platform) &&
        (!filters.category || o.category === filters.category) &&
        (!q || normalizeSearch(`${o.client_name} ${o.description} ${o.created_by || ''}`).includes(q)),
    )
  }, [rows, filters])

  // Mesma ordenação "otimização mais antiga" da lista de clientes (lib compartilhada).
  const ruler = useMemo(() => applyClientSort(clients.filter((c) => c.status === 'active'), 'last_opt'), [clients])
  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }))

  async function remove() {
    try {
      await api(`/optimizations/${modal.item.id}`, { method: 'DELETE' })
      toast('Otimização excluída')
      await reloadAll()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <>
      <PageHeader
        title="Otimizações"
        subtitle="Histórico do que foi feito em cada conta. Cada registro zera a régua de dias do cliente."
        actions={
          <button type="button" className="btn-primary" onClick={() => setModal({ type: 'form' })}>
            <Plus className="h-4 w-4" /> Registrar otimização
          </button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <input type="search" className="input" placeholder="Buscar na descrição…" value={filters.search} onChange={set('search')} aria-label="Buscar otimização" />
            <select className="input" value={filters.client} onChange={set('client')} aria-label="Filtrar por cliente">
              <option value="">Todos os clientes</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select className="input" value={filters.platform} onChange={set('platform')} aria-label="Filtrar por plataforma">
              <option value="">Todas as plataformas</option>
              {Object.entries(PLATFORMS).map(([id, p]) => (
                <option key={id} value={id}>
                  {p.label}
                </option>
              ))}
            </select>
            <select className="input" value={filters.category} onChange={set('category')} aria-label="Filtrar por tipo">
              <option value="">Todos os tipos</option>
              {OPTIMIZATION_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="card overflow-hidden">
            {rows === null ? (
              <div className="flex justify-center py-12">
                <Spinner className="h-6 w-6 text-brand-400" />
              </div>
            ) : shown.length === 0 ? (
              <EmptyState icon={Sparkles} title={rows.length ? 'Nada com esses filtros' : 'Nenhuma otimização registrada ainda'} />
            ) : (
              <>
                <div className="muted border-b border-slate-100 px-4 py-2 text-xs tabular dark:border-slate-800">
                  {shown.length} de {rows.length} registros
                </div>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {shown.map((o) => (
                    <li key={o.id} className="flex gap-4 px-4 py-3">
                      <div className="w-20 shrink-0 text-xs">
                        <div className="font-semibold tabular">{dateBR(o.performed_at)}</div>
                        <div className="mt-1">
                          <PlatformBadge platform={o.platform} />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <Link to={`/clientes/${o.client_id}`} className="text-sm font-semibold hover:underline">
                            {o.client_name}
                          </Link>
                          <span className="text-xs font-semibold uppercase tracking-wide text-brand-500 dark:text-slate-400">
                            {categoryLabel(o.category)}
                          </span>
                        </div>
                        <p className="mt-0.5 whitespace-pre-line text-sm text-brand-700 dark:text-slate-300">{o.description}</p>
                        {o.created_by && <p className="mt-1 text-[11px] text-slate-400">por {o.created_by}</p>}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button type="button" className="icon-btn" onClick={() => setModal({ type: 'form', item: o })} aria-label="Editar">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button type="button" className="icon-btn hover:text-rose-600" onClick={() => setModal({ type: 'delete', item: o })} aria-label="Excluir">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>

        <aside>
          <div className="card xl:sticky xl:top-6">
            <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <h2 className="text-sm font-semibold">Última otimização por cliente</h2>
              <p className="muted text-xs">Verde até 14 dias · amarelo 15–29 · vermelho 30+</p>
            </div>
            <ul className="scroll-thin max-h-[520px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {ruler.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2">
                  <Link to={`/clientes/${c.id}`} className="truncate text-sm hover:underline">
                    {c.name}
                  </Link>
                  <OptimizationBadge date={c.last_optimization_at} />
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <OptimizationForm
        open={modal?.type === 'form'}
        optimization={modal?.item}
        clientId={filters.client || undefined}
        onClose={() => setModal(null)}
        onSaved={reloadAll}
      />
      <ConfirmDialog
        open={modal?.type === 'delete'}
        title="Excluir otimização"
        message="Excluir este registro? A régua de dias do cliente é recalculada com a otimização anterior."
        onConfirm={remove}
        onClose={() => setModal(null)}
      />
    </>
  )
}
