// Linha do tempo: contatos (interações) e, quando passadas, as otimizações,
// na mesma lista em ordem de data. Assim a ficha conta a história inteira do
// cliente num lugar só.
import { useMemo, useState } from 'react'
import { Check, Pencil, Trash2 } from 'lucide-react'
import { api } from '../lib/api.js'
import { categoryLabel, kindLabel } from '../lib/constants.js'
import { dateBR, daysUntil, relativeDay } from '../lib/format.js'
import { KIND_ICONS } from './kindIcons.js'
import ConfirmDialog from './ConfirmDialog.jsx'
import InteractionForm from './InteractionForm.jsx'
import { cx, EmptyState, PlatformBadge } from './ui.jsx'
import { useToast } from './Toast.jsx'

const KIND_TONE = {
  complaint: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  praise: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  note: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  optimization: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
}

export default function Timeline({ interactions, optimizations = [], onChanged, emptyText }) {
  const toast = useToast()
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const items = useMemo(
    () =>
      [
        ...interactions.map((i) => ({ type: 'interaction', date: i.happened_at, item: i })),
        ...optimizations.map((o) => ({ type: 'optimization', date: o.performed_at, item: o })),
      ].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [interactions, optimizations],
  )

  async function markDone(i) {
    try {
      await api(`/interactions/${i.id}`, { method: 'PATCH', body: { next_step_done: true } })
      toast('Próximo passo concluído')
      await onChanged?.()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function remove() {
    try {
      await api(`/interactions/${deleting.id}`, { method: 'DELETE' })
      toast('Registro excluído')
      await onChanged?.()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  if (!items.length) return <EmptyState title="Nada registrado ainda">{emptyText}</EmptyState>

  return (
    <>
      <ol className="divide-y divide-slate-100 dark:divide-slate-800">
        {items.map(({ type, item }) => {
          const kind = type === 'optimization' ? 'optimization' : item.kind
          const Icon = KIND_ICONS[kind]
          const pendingNext = type === 'interaction' && item.next_step && !item.next_step_done
          const overdue = pendingNext && item.next_step_at && daysUntil(item.next_step_at) < 0
          return (
            <li key={`${type}-${item.id}`} className="flex gap-3 px-4 py-3">
              <div
                className={cx(
                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  KIND_TONE[kind] || 'bg-brand-100 text-brand-700 dark:bg-slate-800 dark:text-slate-200',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                  <span className="font-bold uppercase tracking-wide text-brand-600 dark:text-slate-300">
                    {type === 'optimization' ? `Otimização · ${categoryLabel(item.category)}` : kindLabel(item.kind)}
                  </span>
                  {type === 'optimization' && <PlatformBadge platform={item.platform} />}
                  <span className="tabular text-slate-400">{dateBR(item.happened_at || item.performed_at)}</span>
                  {item.created_by && <span className="text-slate-400">· {item.created_by}</span>}
                </div>
                <p className="mt-0.5 whitespace-pre-line text-sm text-brand-800 dark:text-slate-100">{item.summary || item.description}</p>
                {type === 'interaction' && item.next_step && (
                  <p
                    className={cx(
                      'mt-1.5 inline-flex flex-wrap items-center gap-1.5 rounded-md px-2 py-1 text-xs',
                      item.next_step_done
                        ? 'bg-slate-100 text-slate-400 line-through dark:bg-slate-800'
                        : overdue
                          ? 'bg-rose-50 font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'
                          : 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300',
                    )}
                  >
                    Próximo passo: {item.next_step}
                    {item.next_step_at && ` · ${dateBR(item.next_step_at)} (${relativeDay(item.next_step_at)})`}
                  </p>
                )}
              </div>
              {type === 'interaction' && (
                <div className="flex shrink-0 items-start gap-1">
                  {pendingNext && (
                    <button type="button" className="icon-btn hover:text-emerald-600" onClick={() => markDone(item)} title="Concluir próximo passo" aria-label="Concluir próximo passo">
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                  <button type="button" className="icon-btn" onClick={() => setEditing(item)} aria-label="Editar registro">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" className="icon-btn hover:text-rose-600" onClick={() => setDeleting(item)} aria-label="Excluir registro">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ol>
      <InteractionForm open={Boolean(editing)} interaction={editing} onClose={() => setEditing(null)} onSaved={onChanged} />
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Excluir registro"
        message="Excluir este registro da linha do tempo? Não dá para desfazer."
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}
