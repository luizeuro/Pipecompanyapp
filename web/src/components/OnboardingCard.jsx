// Onboarding do cliente: o checklist da Pipe do "fechou" até a primeira
// campanha no ar com rastreamento conferido. Marca/desmarca na hora, mostra
// quem fez, e permite incluir item próprio. Sem checklist, oferece iniciar.
import { useMemo, useState } from 'react'
import { Check, ChevronDown, ListChecks, Plus, Rocket, Trash2 } from 'lucide-react'
import { api } from '../lib/api.js'
import { timeAgo } from '../lib/format.js'
import { useToast } from './Toast.jsx'
import { cx, Spinner } from './ui.jsx'

export function ProgressBar({ done, total, className }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/[0.07]', className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-fill h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function OnboardingCard({ clientId, items, onChanged }) {
  const toast = useToast()
  const [busy, setBusy] = useState(null)
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [collapsed, setCollapsed] = useState({})

  const sections = useMemo(() => {
    const map = new Map()
    for (const item of items) {
      if (!map.has(item.section)) map.set(item.section, [])
      map.get(item.section).push(item)
    }
    return [...map.entries()]
  }, [items])
  const done = items.filter((i) => i.done_at).length
  const complete = items.length > 0 && done === items.length

  async function run(key, fn, okMsg) {
    setBusy(key)
    try {
      await fn()
      if (okMsg) toast(okMsg)
      await onChanged()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  if (!items.length) {
    return (
      <section className="card flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-accent-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-accent-300">
          <Rocket className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-brand-900 dark:text-white">Onboarding do cliente</h2>
          <p className="muted text-sm">Checklist da Pipe: acessos, briefing, rastreamento, produção e lançamento — conforme os serviços do cliente.</p>
        </div>
        <button
          type="button"
          className="btn-primary"
          disabled={busy === 'start'}
          onClick={() => run('start', () => api(`/clients/${clientId}/onboarding`, { method: 'POST' }), 'Checklist de onboarding criado.')}
        >
          {busy === 'start' ? <Spinner /> : <ListChecks className="h-4 w-4" />} Iniciar onboarding
        </button>
      </section>
    )
  }

  return (
    <section className={cx('card', !complete && 'card-glow')}>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-white/[0.06]">
        <h2 className="section-title">Onboarding</h2>
        <span className="font-mono text-xs text-brand-600 dark:text-slate-300">
          {done}/{items.length} {complete ? '· concluído' : ''}
        </span>
        <ProgressBar done={done} total={items.length} className="min-w-[120px] flex-1" />
      </div>
      <div className="divide-y divide-slate-100 dark:divide-white/[0.05]">
        {sections.map(([section, list]) => {
          const sDone = list.filter((i) => i.done_at).length
          const isOpen = collapsed[section] === undefined ? sDone < list.length : !collapsed[section]
          return (
            <div key={section}>
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [section]: isOpen }))}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
                aria-expanded={isOpen}
              >
                <ChevronDown className={cx('h-3.5 w-3.5 text-slate-400 transition', !isOpen && '-rotate-90')} />
                <span className="flex-1 text-sm font-medium text-brand-800 dark:text-slate-100">{section}</span>
                <span className={cx('font-mono text-[11px]', sDone === list.length ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400')}>
                  {sDone}/{list.length}
                </span>
              </button>
              {isOpen && (
                <ul className="pb-2">
                  {list.map((item) => (
                    <li key={item.id} className="group flex items-start gap-3 px-4 py-1.5">
                      <button
                        type="button"
                        disabled={busy === item.id}
                        onClick={() => run(item.id, () => api(`/checklist/${item.id}`, { method: 'PATCH', body: { done: !item.done_at } }))}
                        className={cx(
                          'mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border transition',
                          item.done_at
                            ? 'border-accent-500 bg-accent-500 text-white'
                            : 'border-slate-300 hover:border-accent-400 dark:border-white/20 dark:hover:border-accent-400',
                        )}
                        aria-label={item.done_at ? `Desmarcar: ${item.title}` : `Marcar como feito: ${item.title}`}
                      >
                        {busy === item.id ? <Spinner className="h-3 w-3" /> : item.done_at && <Check className="h-3 w-3" strokeWidth={3} />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={cx('text-sm', item.done_at ? 'text-slate-400 line-through decoration-slate-400/50' : 'text-brand-800 dark:text-slate-200')}>
                          {item.title}
                        </p>
                        {item.done_at ? (
                          <p className="font-mono text-[10.5px] text-slate-400">
                            feito por {item.done_by} · {timeAgo(item.done_at)}
                          </p>
                        ) : (
                          item.hint && <p className="muted text-xs">{item.hint}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        className="icon-btn h-7 w-7 opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                        onClick={() => run(`del-${item.id}`, () => api(`/checklist/${item.id}`, { method: 'DELETE' }))}
                        aria-label={`Remover: ${item.title}`}
                        title="Remover item (não se aplica a este cliente)"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
      <div className="border-t border-slate-100 px-4 py-2.5 dark:border-white/[0.06]">
        {adding ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!newTitle.trim()) return
              run('add', () => api(`/clients/${clientId}/checklist`, { method: 'POST', body: { title: newTitle, section: 'Outros' } })).then(() => {
                setNewTitle('')
                setAdding(false)
              })
            }}
          >
            <input className="input py-1.5" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Novo item do checklist" autoFocus />
            <button type="submit" className="btn-secondary py-1.5" disabled={busy === 'add'}>
              Adicionar
            </button>
          </form>
        ) : (
          <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> Item próprio
          </button>
        )}
      </div>
    </section>
  )
}
