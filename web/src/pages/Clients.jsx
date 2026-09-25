// Clientes: cadastro e visão em tabela (mais densa que os cartões do Painel).
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Pencil, Plus, Trash2, Users } from 'lucide-react'
import { api } from '../lib/api.js'
import { useData } from '../lib/data.jsx'
import { usePersistentState } from '../lib/usePersistentState.js'
import { filterClients } from '../lib/clientFilters.js'
import { CLIENT_STATUS } from '../lib/constants.js'
import { formatGoogleId } from '../lib/format.js'
import { LEVEL_STYLES } from '../lib/urgency.js'
import ClientFilterBar, { DEFAULT_FILTER_STATE } from '../components/ClientFilterBar.jsx'
import ClientForm from '../components/ClientForm.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { useToast } from '../components/Toast.jsx'
import { cx, EmptyState, LevelBadge, OptimizationBadge, PageHeader, TagChip } from '../components/ui.jsx'

function AccountCell({ id, level, format = (v) => v }) {
  if (!id) return <span className="text-slate-300 dark:text-slate-600">—</span>
  const style = LEVEL_STYLES[level] || LEVEL_STYLES.never
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs">
      <span className={cx('h-2 w-2 shrink-0 rounded-full', style.dot)} title="Nível do saldo" />
      {format(id)}
    </span>
  )
}

const CLIENTS_DEFAULTS = { ...DEFAULT_FILTER_STATE, filter: 'all', sort: 'name' }

export default function Clients() {
  const { clients, refresh } = useData()
  const [filters, setFilters] = usePersistentState('pc-filters-clients', CLIENTS_DEFAULTS)
  const [editing, setEditing] = useState(null) // null = fechado, {} = novo, cliente = editar
  const [deleting, setDeleting] = useState(null)
  const toast = useToast()
  const navigate = useNavigate()

  const shown = useMemo(() => filterClients(clients, filters), [clients, filters])

  async function remove() {
    try {
      await api(`/clients/${deleting.id}`, { method: 'DELETE' })
      toast('Cliente excluído')
      await refresh()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle="Cadastro dos clientes e das contas de anúncio monitoradas."
        actions={
          <button type="button" className="btn-primary" onClick={() => setEditing({})}>
            <Plus className="h-4 w-4" /> Novo cliente
          </button>
        }
      />

      <div className="mb-4">
        <ClientFilterBar state={filters} onChange={setFilters} total={clients.length} shown={shown.length} defaults={CLIENTS_DEFAULTS} />
      </div>

      <div className="card overflow-hidden">
        {shown.length === 0 ? (
          <EmptyState
            icon={Users}
            title={clients.length ? 'Nenhum cliente com esse filtro' : 'Nenhum cliente cadastrado'}
            action={
              !clients.length && (
                <button type="button" className="btn-primary" onClick={() => setEditing({})}>
                  <Plus className="h-4 w-4" /> Cadastrar o primeiro
                </button>
              )
            }
          />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-brand-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Cliente</th>
                  <th className="px-4 py-3 font-semibold">Situação</th>
                  <th className="px-4 py-3 font-semibold">Meta Ads</th>
                  <th className="px-4 py-3 font-semibold">Google Ads</th>
                  <th className="px-4 py-3 font-semibold">Responsável</th>
                  <th className="px-4 py-3 font-semibold">Última otimização</th>
                  <th className="px-4 py-3 text-center font-semibold">Pend.</th>
                  <th className="px-4 py-3" aria-label="Ações" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {shown.map((c) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    onClick={() => navigate(`/clientes/${c.id}`)}
                  >
                    <td className="px-4 py-3">
                      <Link to={`/clientes/${c.id}`} className="font-semibold hover:underline" onClick={(e) => e.stopPropagation()}>
                        {c.name}
                      </Link>
                      {c.tags?.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {c.tags.map((t) => (
                            <TagChip key={t} id={t} size="xs" />
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <LevelBadge level={c.status === 'active' ? 'ok' : 'never'}>{CLIENT_STATUS[c.status]?.label}</LevelBadge>
                    </td>
                    <td className="px-4 py-3">
                      <AccountCell id={c.meta_ad_account_id} level={c.meta_level} format={(v) => `act_${v}`} />
                    </td>
                    <td className="px-4 py-3">
                      <AccountCell id={c.google_ads_customer_id} level={c.google_level} format={formatGoogleId} />
                    </td>
                    <td className="muted px-4 py-3">{c.manager || '—'}</td>
                    <td className="px-4 py-3">
                      <OptimizationBadge date={c.last_optimization_at} />
                    </td>
                    <td className="tabular px-4 py-3 text-center">
                      {c.open_pendencias_count > 0 ? (
                        <span className={c.overdue_pendencias_count ? 'font-bold text-rose-600 dark:text-rose-300' : 'font-semibold'}>
                          {c.open_pendencias_count}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="icon-btn" onClick={() => setEditing(c)} aria-label={`Editar ${c.name}`} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="icon-btn hover:text-rose-600"
                          onClick={() => setDeleting(c)}
                          aria-label={`Excluir ${c.name}`}
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ClientForm
        open={editing !== null}
        client={editing?.id ? editing : null}
        onClose={() => setEditing(null)}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Excluir cliente"
        message={`Excluir "${deleting?.name}"? Isso apaga também o histórico de saldo, as otimizações, as pendências e os alertas dele. Não dá para desfazer — se o cliente só parou, prefira mudar a situação para "Pausado".`}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}
