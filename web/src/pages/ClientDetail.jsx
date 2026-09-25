// Página de um cliente: contas (versão detalhada), gráfico de saldo e abas
// com otimizações, pendências e alertas só dele.
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, Pencil, Plus, Trash2, UserRound } from 'lucide-react'
import { api } from '../lib/api.js'
import { useData } from '../lib/data.jsx'
import { CLIENT_STATUS, categoryLabel, ALERT_TYPES } from '../lib/constants.js'
import { dateBR, dateTimeBR, formatGoogleId, timeAgo, money } from '../lib/format.js'
import BalanceChart from '../components/BalanceChart.jsx'
import PlatformBlock from '../components/PlatformBlock.jsx'
import CheckNowButton from '../components/CheckNowButton.jsx'
import ClientForm from '../components/ClientForm.jsx'
import OptimizationForm from '../components/OptimizationForm.jsx'
import PendenciaForm from '../components/PendenciaForm.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { useToast } from '../components/Toast.jsx'
import {
  cx,
  EmptyState,
  LevelBadge,
  OptimizationBadge,
  PlatformBadge,
  SeverityIcon,
  Spinner,
  TagChip,
  Tabs,
} from '../components/ui.jsx'

export default function ClientDetail() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { refresh: refreshShared } = useData()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [modal, setModal] = useState(null) // {type, item}
  const tab = params.get('aba') || 'otimizacoes'

  const load = useCallback(async () => {
    try {
      setData(await api(`/clients/${id}`))
      setError(null)
    } catch (err) {
      setError(err)
    }
  }, [id])

  useEffect(() => {
    setData(null)
    load()
  }, [load])

  // Depois de qualquer alteração: recarrega esta página e as listas compartilhadas (menu, painel).
  const reloadAll = useCallback(() => Promise.all([load(), refreshShared()]), [load, refreshShared])

  if (error) {
    return (
      <div className="card">
        <EmptyState title={error.status === 404 || error.status === 400 ? 'Cliente não encontrado' : 'Erro ao carregar'} action={<Link to="/clientes" className="btn-secondary">Voltar para clientes</Link>}>
          {error.message}
        </EmptyState>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-6 w-6 text-brand-400" />
      </div>
    )
  }

  const { client: c, snapshots, optimizations, pendencias, alerts } = data
  const openPend = pendencias.filter((p) => p.status === 'open')
  const openAlerts = alerts.filter((a) => !a.resolved_at)
  const today = new Date().toISOString().slice(0, 10)
  const currency = c.meta_snapshot?.currency || c.google_snapshot?.currency || 'BRL'

  async function togglePendencia(p) {
    try {
      await api(`/pendencias/${p.id}`, { method: 'PATCH', body: { status: p.status === 'open' ? 'done' : 'open' } })
      toast(p.status === 'open' ? 'Pendência concluída' : 'Pendência reaberta')
      await reloadAll()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function resolveAlert(a) {
    try {
      await api(`/alerts/${a.id}/resolve`, { method: 'POST' })
      toast('Alerta resolvido')
      await reloadAll()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function confirmDelete() {
    const { type, item } = modal
    try {
      if (type === 'delete-client') {
        await api(`/clients/${c.id}`, { method: 'DELETE' })
        toast('Cliente excluído')
        await refreshShared()
        navigate('/clientes')
        return
      }
      await api(type === 'delete-opt' ? `/optimizations/${item.id}` : `/pendencias/${item.id}`, { method: 'DELETE' })
      toast('Excluído')
      await reloadAll()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const closeModal = () => setModal(null)
  const platforms = [
    c.meta_ad_account_id && ['meta', c.meta_snapshot, c.meta_level, `act_${c.meta_ad_account_id}`],
    c.google_ads_customer_id && ['google', c.google_snapshot, c.google_level, formatGoogleId(c.google_ads_customer_id)],
  ].filter(Boolean)

  return (
    <>
      <Link to="/clientes" className="muted mb-3 inline-flex items-center gap-1 text-sm hover:text-brand-800 dark:hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Clientes
      </Link>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-brand-800 dark:text-white">{c.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <LevelBadge level={c.status === 'active' ? 'ok' : 'never'}>{CLIENT_STATUS[c.status]?.label}</LevelBadge>
            {(c.tags || []).map((t) => (
              <TagChip key={t} id={t} />
            ))}
            {c.manager && (
              <span className="muted ml-1 inline-flex items-center gap-1 text-xs">
                <UserRound className="h-3.5 w-3.5" /> {c.manager}
              </span>
            )}
            <OptimizationBadge date={c.last_optimization_at} prefix="Otimização: " />
          </div>
          <p className="muted mt-2 text-xs">
            Verificado {timeAgo(c.last_check_at)}
            {c.monthly_budget ? ` · Verba mensal ${money(c.monthly_budget)}` : ''}
            {` · Alerta de saldo abaixo de ${money(c.balance_alert_threshold)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CheckNowButton clientId={c.id} onDone={load} />
          <button type="button" className="btn-secondary" onClick={() => setModal({ type: 'edit-client' })}>
            <Pencil className="h-4 w-4" /> Editar
          </button>
          <button type="button" className="btn-ghost text-rose-600 dark:text-rose-300" onClick={() => setModal({ type: 'delete-client' })}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {platforms.length > 0 ? (
        <div className={cx('mb-6 grid gap-4', platforms.length === 2 && 'lg:grid-cols-2')}>
          {platforms.map(([p, s, level, label]) => (
            <div key={p}>
              <div className="muted mb-1.5 font-mono text-xs">{label}</div>
              <PlatformBlock platform={p} snapshot={s} level={level} detailed />
            </div>
          ))}
        </div>
      ) : (
        <div className="card mb-6 p-4 text-sm">
          Nenhuma conta de anúncio vinculada.{' '}
          <button type="button" className="font-semibold underline" onClick={() => setModal({ type: 'edit-client' })}>
            Adicionar IDs das contas
          </button>
        </div>
      )}

      <section className="card mb-6 p-4">
        <h2 className="section-title mb-3">Saldo nos últimos 30 dias</h2>
        <BalanceChart snapshots={snapshots} currency={currency} />
      </section>

      {c.notes && (
        <section className="card mb-6 p-4">
          <h2 className="section-title mb-2">Observações</h2>
          <p className="whitespace-pre-line text-sm text-brand-600 dark:text-slate-300">{c.notes}</p>
        </section>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={tab}
          onChange={(v) => setParams({ aba: v }, { replace: true })}
          tabs={[
            { id: 'otimizacoes', label: 'Otimizações', count: optimizations.length },
            { id: 'pendencias', label: 'Pendências', count: openPend.length },
            { id: 'alertas', label: 'Alertas', count: openAlerts.length },
          ]}
        />
        {tab === 'otimizacoes' && (
          <button type="button" className="btn-primary" onClick={() => setModal({ type: 'opt' })}>
            <Plus className="h-4 w-4" /> Registrar otimização
          </button>
        )}
        {tab === 'pendencias' && (
          <button type="button" className="btn-primary" onClick={() => setModal({ type: 'pend' })}>
            <Plus className="h-4 w-4" /> Nova pendência
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        {tab === 'otimizacoes' &&
          (optimizations.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {optimizations.map((o) => (
                <li key={o.id} className="flex gap-4 px-4 py-3">
                  <div className="w-20 shrink-0 text-xs">
                    <div className="font-semibold tabular">{dateBR(o.performed_at)}</div>
                    <div className="mt-1">
                      <PlatformBadge platform={o.platform} />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold uppercase tracking-wide text-brand-500 dark:text-slate-400">{categoryLabel(o.category)}</div>
                    <p className="mt-0.5 whitespace-pre-line text-sm">{o.description}</p>
                    {o.created_by && <p className="mt-1 text-[11px] text-slate-400">por {o.created_by}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" className="icon-btn" onClick={() => setModal({ type: 'opt', item: o })} aria-label="Editar otimização">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" className="icon-btn hover:text-rose-600" onClick={() => setModal({ type: 'delete-opt', item: o })} aria-label="Excluir otimização">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nenhuma otimização registrada">Registre cada mexida na conta: é isso que alimenta a régua de dias.</EmptyState>
          ))}

        {tab === 'pendencias' &&
          (pendencias.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {pendencias.map((p) => {
                const overdue = p.status === 'open' && p.due_date && p.due_date < today
                return (
                  <li key={p.id} className="flex items-start gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => togglePendencia(p)}
                      className={cx(
                        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition',
                        p.status === 'done'
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : 'border-slate-300 hover:border-brand-500 dark:border-slate-600',
                      )}
                      aria-label={p.status === 'done' ? 'Reabrir pendência' : 'Concluir pendência'}
                    >
                      {p.status === 'done' && <Check className="h-3.5 w-3.5" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={cx('text-sm font-medium', p.status === 'done' && 'text-slate-400 line-through')}>{p.title}</p>
                      {p.description && <p className="muted mt-0.5 whitespace-pre-line text-xs">{p.description}</p>}
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                        {p.due_date && (
                          <span className={overdue ? 'font-bold text-rose-600 dark:text-rose-300' : 'text-slate-400'}>
                            {overdue ? 'Atrasada · ' : 'Prazo '}
                            {dateBR(p.due_date)}
                          </span>
                        )}
                        {p.assignee && <span className="text-slate-400">· {p.assignee}</span>}
                        {p.status === 'done' && p.done_at && <span className="text-slate-400">· concluída {timeAgo(p.done_at)}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button type="button" className="icon-btn" onClick={() => setModal({ type: 'pend', item: p })} aria-label="Editar pendência">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" className="icon-btn hover:text-rose-600" onClick={() => setModal({ type: 'delete-pend', item: p })} aria-label="Excluir pendência">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState title="Nenhuma pendência">Anote aqui o que depende do cliente ou da equipe.</EmptyState>
          ))}

        {tab === 'alertas' &&
          (alerts.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {alerts.map((a) => (
                <li key={a.id} className={cx('flex items-start gap-3 px-4 py-3', a.resolved_at && 'opacity-60')}>
                  <SeverityIcon severity={a.severity} className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <PlatformBadge platform={a.platform} />
                      <span className="font-semibold">{ALERT_TYPES[a.type] || a.type}</span>
                    </div>
                    <p className="mt-1 text-sm">{a.message}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Aberto {dateTimeBR(a.created_at)}
                      {a.resolved_at && ` · resolvido ${timeAgo(a.resolved_at)} (${a.resolved_by || '—'})`}
                    </p>
                  </div>
                  {!a.resolved_at && (
                    <button type="button" className="btn-secondary shrink-0 px-2.5 py-1 text-xs" onClick={() => resolveAlert(a)}>
                      <Check className="h-3.5 w-3.5" /> Resolver
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nenhum alerta">As verificações automáticas não encontraram problema neste cliente.</EmptyState>
          ))}
      </div>

      <ClientForm open={modal?.type === 'edit-client'} client={c} onClose={closeModal} onSaved={reloadAll} />
      <OptimizationForm open={modal?.type === 'opt'} optimization={modal?.item} clientId={c.id} onClose={closeModal} onSaved={reloadAll} />
      <PendenciaForm open={modal?.type === 'pend'} pendencia={modal?.item} clientId={c.id} onClose={closeModal} onSaved={reloadAll} />
      <ConfirmDialog
        open={['delete-client', 'delete-opt', 'delete-pend'].includes(modal?.type)}
        title={modal?.type === 'delete-client' ? 'Excluir cliente' : 'Excluir registro'}
        message={
          modal?.type === 'delete-client'
            ? `Excluir "${c.name}" e todo o histórico dele? Não dá para desfazer. Se o cliente só parou, prefira mudar a situação para "Pausado".`
            : 'Excluir este registro? Não dá para desfazer.'
        }
        onConfirm={confirmDelete}
        onClose={closeModal}
      />
    </>
  )
}
