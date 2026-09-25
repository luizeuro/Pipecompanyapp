// Painel lateral do Painel com vários blocos colapsáveis.
// Um estado só (`openPanel`) controla qual bloco está aberto: abrir um fecha
// os outros, pra coluna nunca virar um paredão. Cada bloco que pode crescer
// tem rolagem própria, contador "X de Y" e busca quando passa de 20 itens.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BellRing, ChevronDown, Clock, ListTodo, Search, Wallet, Check } from 'lucide-react'
import { useData } from '../lib/data.jsx'
import { api } from '../lib/api.js'
import { daysLabel, money, normalizeSearch, timeAgo } from '../lib/format.js'
import { daysSince, urgencyLevel, LEVEL_STYLES } from '../lib/urgency.js'
import { isStale } from '../lib/clientFilters.js'
import { cx, OptimizationBadge, PlatformBadge, SeverityIcon, LevelBadge, Spinner } from './ui.jsx'
import { useToast } from './Toast.jsx'

const SEARCH_THRESHOLD = 20

function Panel({ id, title, icon: Icon, count, level, openPanel, setOpenPanel, children }) {
  const open = openPanel === id
  const style = level ? LEVEL_STYLES[level] : null
  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
        onClick={() => setOpenPanel(open ? null : id)}
        aria-expanded={open}
      >
        <Icon className={cx('h-4 w-4 shrink-0', style ? style.text : 'text-brand-400')} aria-hidden="true" />
        <span className="flex-1 text-sm font-semibold text-brand-800 dark:text-slate-100">{title}</span>
        <span
          className={cx(
            'tabular rounded-full px-2 py-0.5 text-xs font-bold',
            count > 0 && style ? style.badge : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
          )}
        >
          {count}
        </span>
        <ChevronDown className={cx('h-4 w-4 text-slate-400 transition', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && <div className="border-t border-slate-200 dark:border-slate-800">{children}</div>}
    </section>
  )
}

// Lista com busca opcional, contador e rolagem própria.
function PanelList({ items, total, search, setSearch, empty, children }) {
  return (
    <div>
      {total > SEARCH_THRESHOLD && (
        <div className="relative px-3 pt-3">
          <Search className="pointer-events-none absolute left-6 top-1/2 mt-1.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            className="input py-1.5 pl-8 text-xs"
            placeholder="Buscar pelo nome do cliente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}
      <div className="muted px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide tabular">
        {items.length} de {total} {total === 1 ? 'item' : 'itens'}
      </div>
      {items.length === 0 ? (
        <p className="muted px-4 pb-4 pt-1 text-sm">{empty}</p>
      ) : (
        <ul className="scroll-thin max-h-[360px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">{children}</ul>
      )}
    </div>
  )
}

const matches = (name, q) => !q || normalizeSearch(name).includes(normalizeSearch(q))

export default function AlertsSidebar() {
  const { alerts, clients, clientsById, refresh } = useData()
  const toast = useToast()
  const [openPanel, setOpenPanel] = useState('alerts')
  const [search, setSearch] = useState({ alerts: '', balance: '', stale: '', pend: '' })
  const [resolving, setResolving] = useState(null)
  const setSearchFor = (key) => (value) => setSearch((s) => ({ ...s, [key]: value }))

  const active = useMemo(() => clients.filter((c) => c.status === 'active'), [clients])

  const sortedAlerts = useMemo(
    () => [...alerts].sort((a, b) => (a.severity === 'critical' ? -1 : 0) - (b.severity === 'critical' ? -1 : 0)),
    [alerts],
  )
  const lowBalance = useMemo(
    () =>
      active
        .filter((c) => c.balance_level === 'critical' || c.balance_level === 'warn')
        .sort((a, b) => (a.min_days_left ?? 0) - (b.min_days_left ?? 0)),
    [active],
  )
  const stale = useMemo(
    () =>
      active
        .filter(isStale)
        .sort((a, b) => (daysSince(b.last_optimization_at) ?? 9999) - (daysSince(a.last_optimization_at) ?? 9999)),
    [active],
  )
  const withPend = useMemo(
    () =>
      clients
        .filter((c) => c.open_pendencias_count > 0)
        .sort((a, b) => b.overdue_pendencias_count - a.overdue_pendencias_count || b.open_pendencias_count - a.open_pendencias_count),
    [clients],
  )

  async function resolve(alert) {
    setResolving(alert.id)
    try {
      await api(`/alerts/${alert.id}/resolve`, { method: 'POST' })
      toast('Alerta marcado como resolvido')
      await refresh()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setResolving(null)
    }
  }

  const alertItems = sortedAlerts.filter((a) => matches(a.client_name, search.alerts))
  const balanceItems = lowBalance.filter((c) => matches(c.name, search.balance))
  const staleItems = stale.filter((c) => matches(c.name, search.stale))
  const pendItems = withPend.filter((c) => matches(c.name, search.pend))
  const common = { openPanel, setOpenPanel }

  return (
    <div className="space-y-3">
      <Panel
        id="alerts"
        title="Alertas abertos"
        icon={BellRing}
        count={alerts.length}
        level={alerts.some((a) => a.severity === 'critical') ? 'critical' : 'warn'}
        {...common}
      >
        <PanelList
          items={alertItems}
          total={alerts.length}
          search={search.alerts}
          setSearch={setSearchFor('alerts')}
          empty="Nenhum alerta aberto. Tudo em ordem."
        >
          {alertItems.map((a) => (
            <li key={a.id} className="flex gap-3 px-4 py-3">
              <SeverityIcon severity={a.severity} className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Link to={`/clientes/${a.client_id}`} className="truncate text-sm font-semibold hover:underline">
                    {clientsById.get(a.client_id)?.name || a.client_name}
                  </Link>
                  <PlatformBadge platform={a.platform} />
                </div>
                <p className="muted mt-0.5 text-xs leading-relaxed">{a.message}</p>
                <p className="mt-1 text-[11px] text-slate-400">{timeAgo(a.created_at)}</p>
              </div>
              <button
                type="button"
                className="icon-btn shrink-0"
                title="Marcar como resolvido"
                aria-label="Marcar como resolvido"
                onClick={() => resolve(a)}
                disabled={resolving === a.id}
              >
                {resolving === a.id ? <Spinner /> : <Check className="h-4 w-4" />}
              </button>
            </li>
          ))}
        </PanelList>
      </Panel>

      <Panel id="balance" title="Saldo acabando" icon={Wallet} count={lowBalance.length} level="critical" {...common}>
        <PanelList
          items={balanceItems}
          total={lowBalance.length}
          search={search.balance}
          setSearch={setSearchFor('balance')}
          empty="Nenhum cliente com saldo para menos de 7 dias."
        >
          {balanceItems.map((c) => {
            const platforms = [
              ['meta', c.meta_snapshot, c.meta_level],
              ['google', c.google_snapshot, c.google_level],
            ].filter(([, , level]) => level === 'critical' || level === 'warn')
            return (
              <li key={c.id} className="px-4 py-3">
                <Link to={`/clientes/${c.id}`} className="text-sm font-semibold hover:underline">
                  {c.name}
                </Link>
                {platforms.map(([p, s, level]) => (
                  <div key={p} className="mt-1 flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5">
                      <PlatformBadge platform={p} />
                      <span className="tabular font-semibold">{money(s.balance, s.currency)}</span>
                    </span>
                    <LevelBadge level={level}>{daysLabel(s.days_left) || 'abaixo do mínimo'}</LevelBadge>
                  </div>
                ))}
              </li>
            )
          })}
        </PanelList>
      </Panel>

      <Panel
        id="stale"
        title="Sem otimização recente"
        icon={Clock}
        count={stale.length}
        level={stale.some((c) => urgencyLevel(daysSince(c.last_optimization_at)) === 'critical') ? 'critical' : 'warn'}
        {...common}
      >
        <PanelList
          items={staleItems}
          total={stale.length}
          search={search.stale}
          setSearch={setSearchFor('stale')}
          empty="Todos os clientes ativos foram otimizados nos últimos 14 dias."
        >
          {staleItems.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
              <Link to={`/clientes/${c.id}`} className="truncate text-sm font-semibold hover:underline">
                {c.name}
              </Link>
              <OptimizationBadge date={c.last_optimization_at} />
            </li>
          ))}
        </PanelList>
      </Panel>

      <Panel
        id="pend"
        title="Pendências abertas"
        icon={ListTodo}
        count={withPend.reduce((s, c) => s + c.open_pendencias_count, 0)}
        level={withPend.some((c) => c.overdue_pendencias_count > 0) ? 'critical' : 'warn'}
        {...common}
      >
        <PanelList
          items={pendItems}
          total={withPend.length}
          search={search.pend}
          setSearch={setSearchFor('pend')}
          empty="Nenhuma pendência aberta."
        >
          {pendItems.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
              <Link to={`/clientes/${c.id}`} className="truncate text-sm font-semibold hover:underline">
                {c.name}
              </Link>
              <span className="flex shrink-0 items-center gap-1.5 text-xs">
                {c.overdue_pendencias_count > 0 && (
                  <LevelBadge level="critical">{c.overdue_pendencias_count} atrasada(s)</LevelBadge>
                )}
                <span className="muted tabular">{c.open_pendencias_count} aberta(s)</span>
              </span>
            </li>
          ))}
        </PanelList>
      </Panel>
    </div>
  )
}
