// Contas de anúncio: resumo do tráfego + cartões dos clientes + painel lateral de alertas.
// Os números dos cartões de resumo filtram a lista com um clique.
import { useMemo, useState } from 'react'
import { AlertOctagon, Clock, ListTodo, TrendingUp, Users, Wallet } from 'lucide-react'
import { useData } from '../lib/data.jsx'
import { usePersistentState } from '../lib/usePersistentState.js'
import { filterClients, isLowBalance, isStale } from '../lib/clientFilters.js'
import { moneyCompact, timeAgo } from '../lib/format.js'
import ClientFilterBar, { DEFAULT_FILTER_STATE } from '../components/ClientFilterBar.jsx'
import ClientCard from '../components/ClientCard.jsx'
import AlertsSidebar from '../components/AlertsSidebar.jsx'
import CheckNowButton from '../components/CheckNowButton.jsx'
import OptimizationForm from '../components/OptimizationForm.jsx'
import { EmptyState, PageHeader, StatTile, Spinner } from '../components/ui.jsx'

export default function Dashboard() {
  const { clients, alerts, lastCheck, loading, refresh } = useData()
  const [filters, setFilters] = usePersistentState('pc-filters-dashboard', DEFAULT_FILTER_STATE)
  const [optFor, setOptFor] = useState(null)

  const shown = useMemo(() => filterClients(clients, filters), [clients, filters])
  const active = clients.filter((c) => c.status === 'active')
  const lowBalance = active.filter(isLowBalance)
  const criticalBalance = active.filter((c) => c.balance_level === 'critical')
  const stale = active.filter(isStale)
  const openPend = clients.reduce((s, c) => s + c.open_pendencias_count, 0)
  const overdue = clients.reduce((s, c) => s + c.overdue_pendencias_count, 0)
  const spend7d = active.reduce((s, c) => s + (c.spend_7d_total || 0), 0)
  const critical = alerts.filter((a) => a.severity === 'critical').length

  const quickFilter = (filter) => setFilters({ ...filters, filter, search: '', tags: [] })

  return (
    <>
      <PageHeader
        title="Contas de anúncio"
        subtitle={
          lastCheck
            ? `Última verificação geral ${timeAgo(lastCheck.at)} · ${lastCheck.checked} cliente(s)`
            : 'Nenhuma verificação feita ainda'
        }
        actions={<CheckNowButton />}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Ativos" value={active.length} icon={Users} onClick={() => quickFilter('active')} active={filters.filter === 'active'} />
        <StatTile
          label="Alertas abertos"
          value={alerts.length}
          hint={critical ? `${critical} crítico(s)` : 'nenhum crítico'}
          level={critical ? 'critical' : alerts.length ? 'warn' : 'ok'}
          icon={AlertOctagon}
          onClick={() => quickFilter('alerts')}
          active={filters.filter === 'alerts'}
        />
        <StatTile
          label="Saldo acabando"
          value={lowBalance.length}
          hint={`${criticalBalance.length} para menos de 3 dias`}
          level={criticalBalance.length ? 'critical' : lowBalance.length ? 'warn' : 'ok'}
          icon={Wallet}
          onClick={() => quickFilter('low_balance')}
          active={filters.filter === 'low_balance'}
        />
        <StatTile
          label="Sem otimização"
          value={stale.length}
          hint="sem otimizar há 15+ dias"
          level={stale.length ? 'warn' : 'ok'}
          icon={Clock}
          onClick={() => quickFilter('stale')}
          active={filters.filter === 'stale'}
        />
        <StatTile
          label="Pendências"
          value={openPend}
          hint={overdue ? `${overdue} atrasada(s)` : 'nenhuma atrasada'}
          level={overdue ? 'critical' : undefined}
          icon={ListTodo}
          onClick={() => quickFilter('pendencias')}
          active={filters.filter === 'pendencias'}
        />
        <StatTile label="Investido 7d" value={moneyCompact(spend7d)} hint="Meta + Google, ativos" icon={TrendingUp} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="order-2 min-w-0 space-y-4 xl:order-1">
          <ClientFilterBar state={filters} onChange={setFilters} total={clients.length} shown={shown.length} />
          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner className="h-6 w-6 text-brand-400" />
            </div>
          ) : shown.length ? (
            <div className="grid gap-4 2xl:grid-cols-2">
              {shown.map((c) => (
                <ClientCard key={c.id} client={c} onAddOptimization={setOptFor} />
              ))}
            </div>
          ) : (
            <div className="card">
              <EmptyState icon={Users} title={clients.length ? 'Nenhum cliente com esse filtro' : 'Nenhum cliente cadastrado ainda'}>
                {clients.length ? 'Troque o filtro ou limpe a busca.' : 'Cadastre os clientes na aba Clientes.'}
              </EmptyState>
            </div>
          )}
        </section>
        <aside className="order-1 xl:order-2">
          <div className="xl:sticky xl:top-6">
            <AlertsSidebar />
          </div>
        </aside>
      </div>

      <OptimizationForm open={Boolean(optFor)} clientId={optFor?.id} onClose={() => setOptFor(null)} onSaved={refresh} />
    </>
  )
}
