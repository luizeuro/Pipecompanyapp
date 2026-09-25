// Pendências de todos os clientes: abertas (atrasadas primeiro) e concluídas.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ListTodo, Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api.js'
import { useData } from '../lib/data.jsx'
import { usePersistentState } from '../lib/usePersistentState.js'
import { dateBR, normalizeSearch, timeAgo } from '../lib/format.js'
import PendenciaForm from '../components/PendenciaForm.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { useToast } from '../components/Toast.jsx'
import { cx, EmptyState, PageHeader, Spinner, Tabs } from '../components/ui.jsx'

export default function Pendencias() {
  const { clients, users, refresh } = useData()
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const [filters, setFilters] = usePersistentState('pc-filters-pend', { tab: 'open', client: '', assignee: '', search: '' })
  const [modal, setModal] = useState(null)
  const today = new Date().toISOString().slice(0, 10)

  const load = useCallback(async () => {
    try {
      const { pendencias } = await api('/pendencias?status=all')
      setRows(pendencias)
    } catch (err) {
      toast(err.message, 'error')
      setRows([])
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const reloadAll = () => Promise.all([load(), refresh()])
  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }))

  const counts = useMemo(
    () => ({ open: rows?.filter((p) => p.status === 'open').length ?? 0, done: rows?.filter((p) => p.status === 'done').length ?? 0 }),
    [rows],
  )

  const shown = useMemo(() => {
    if (!rows) return []
    const q = normalizeSearch(filters.search)
    const list = rows.filter(
      (p) =>
        p.status === filters.tab &&
        (!filters.client || p.client_id === filters.client) &&
        (!filters.assignee || p.assignee === filters.assignee) &&
        (!q || normalizeSearch(`${p.title} ${p.description || ''} ${p.client_name}`).includes(q)),
    )
    if (filters.tab === 'done') return list.sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''))
    // Abertas: atrasadas primeiro, depois por prazo (sem prazo no fim).
    return list.sort((a, b) => {
      const ad = a.due_date || '9999-12-31'
      const bd = b.due_date || '9999-12-31'
      return ad.localeCompare(bd)
    })
  }, [rows, filters])

  const assignees = useMemo(
    () => [...new Set([...users.map((u) => u.name), ...(rows || []).map((p) => p.assignee).filter(Boolean)])].sort(),
    [users, rows],
  )

  async function toggle(p) {
    try {
      await api(`/pendencias/${p.id}`, { method: 'PATCH', body: { status: p.status === 'open' ? 'done' : 'open' } })
      toast(p.status === 'open' ? 'Pendência concluída' : 'Pendência reaberta')
      await reloadAll()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function remove() {
    try {
      await api(`/pendencias/${modal.item.id}`, { method: 'DELETE' })
      toast('Pendência excluída')
      await reloadAll()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <>
      <PageHeader
        title="Pendências"
        subtitle="O que está travando cada cliente: acessos, materiais, aprovações, tarefas da equipe."
        actions={
          <button type="button" className="btn-primary" onClick={() => setModal({ type: 'form' })}>
            <Plus className="h-4 w-4" /> Nova pendência
          </button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs
          value={filters.tab}
          onChange={(tab) => setFilters((f) => ({ ...f, tab }))}
          tabs={[
            { id: 'open', label: 'Abertas', count: counts.open },
            { id: 'done', label: 'Concluídas', count: counts.done },
          ]}
        />
        <div className="grid flex-1 gap-2 sm:grid-cols-3">
          <input type="search" className="input" placeholder="Buscar…" value={filters.search} onChange={set('search')} aria-label="Buscar pendência" />
          <select className="input" value={filters.client} onChange={set('client')} aria-label="Filtrar por cliente">
            <option value="">Todos os clientes</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="input" value={filters.assignee} onChange={set('assignee')} aria-label="Filtrar por responsável">
            <option value="">Todos os responsáveis</option>
            {assignees.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        {rows === null ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-6 w-6 text-brand-400" />
          </div>
        ) : shown.length === 0 ? (
          <EmptyState icon={ListTodo} title={filters.tab === 'open' ? 'Nenhuma pendência aberta' : 'Nenhuma pendência concluída'} />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {shown.map((p) => {
              const overdue = p.status === 'open' && p.due_date && p.due_date < today
              return (
                <li key={p.id} className={cx('flex items-start gap-3 px-4 py-3', overdue && 'bg-rose-50/50 dark:bg-rose-500/5')}>
                  <button
                    type="button"
                    onClick={() => toggle(p)}
                    className={cx(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition',
                      p.status === 'done' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 hover:border-brand-500 dark:border-slate-600',
                    )}
                    aria-label={p.status === 'done' ? 'Reabrir' : 'Concluir'}
                  >
                    {p.status === 'done' && <Check className="h-3.5 w-3.5" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={cx('text-sm font-medium', p.status === 'done' && 'text-slate-400 line-through')}>{p.title}</p>
                    {p.description && <p className="muted mt-0.5 whitespace-pre-line text-xs">{p.description}</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px]">
                      <Link to={`/clientes/${p.client_id}?aba=pendencias`} className="font-semibold text-brand-600 hover:underline dark:text-slate-300">
                        {p.client_name}
                      </Link>
                      {p.due_date && (
                        <span className={overdue ? 'font-bold text-rose-600 dark:text-rose-300' : 'text-slate-400'}>
                          · {overdue ? 'Atrasada, prazo ' : 'Prazo '}
                          {dateBR(p.due_date)}
                        </span>
                      )}
                      {p.assignee && <span className="text-slate-400">· {p.assignee}</span>}
                      {p.status === 'done' && <span className="text-slate-400">· concluída {timeAgo(p.done_at)}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" className="icon-btn" onClick={() => setModal({ type: 'form', item: p })} aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" className="icon-btn hover:text-rose-600" onClick={() => setModal({ type: 'delete', item: p })} aria-label="Excluir">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <PendenciaForm
        open={modal?.type === 'form'}
        pendencia={modal?.item}
        clientId={filters.client || undefined}
        onClose={() => setModal(null)}
        onSaved={reloadAll}
      />
      <ConfirmDialog
        open={modal?.type === 'delete'}
        title="Excluir pendência"
        message="Excluir esta pendência? Se ela só foi resolvida, prefira marcar como concluída."
        onConfirm={remove}
        onClose={() => setModal(null)}
      />
    </>
  )
}
