// Alertas: abertos (o que precisa de ação agora) e histórico de resolvidos.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BellRing, Check } from 'lucide-react'
import { api } from '../lib/api.js'
import { useData } from '../lib/data.jsx'
import { ALERT_TYPES } from '../lib/constants.js'
import { dateTimeBR, normalizeSearch, timeAgo } from '../lib/format.js'
import CheckNowButton from '../components/CheckNowButton.jsx'
import { useToast } from '../components/Toast.jsx'
import { cx, EmptyState, PageHeader, PlatformBadge, SeverityBadge, SeverityIcon, Spinner, Tabs } from '../components/ui.jsx'

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 }

export default function Alerts() {
  const { alerts: openAlerts, refresh } = useData()
  const toast = useToast()
  const [tab, setTab] = useState('open')
  const [resolved, setResolved] = useState(null)
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')

  const loadResolved = useCallback(async () => {
    try {
      const { alerts } = await api('/alerts?status=resolved&limit=300')
      setResolved(alerts)
    } catch (err) {
      toast(err.message, 'error')
      setResolved([])
    }
  }, [toast])

  useEffect(() => {
    if (tab === 'resolved') loadResolved()
  }, [tab, loadResolved])

  const source = tab === 'open' ? openAlerts : resolved
  const shown = useMemo(() => {
    if (!source) return []
    const q = normalizeSearch(search)
    const list = source.filter((a) => (!type || a.type === type) && (!q || normalizeSearch(`${a.client_name} ${a.message}`).includes(q)))
    return tab === 'open' ? [...list].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]) : list
  }, [source, search, type, tab])

  async function resolve(a) {
    try {
      await api(`/alerts/${a.id}/resolve`, { method: 'POST' })
      toast('Alerta resolvido')
      await refresh()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <>
      <PageHeader
        title="Alertas"
        subtitle="Gerados pelas verificações automáticas. Quando o problema some, o alerta se resolve sozinho."
        actions={<CheckNowButton />}
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'open', label: 'Abertos', count: openAlerts.length },
            { id: 'resolved', label: 'Resolvidos' },
          ]}
        />
        <div className="grid flex-1 gap-2 sm:grid-cols-2">
          <input type="search" className="input" placeholder="Buscar cliente ou mensagem…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar alerta" />
          <select className="input" value={type} onChange={(e) => setType(e.target.value)} aria-label="Filtrar por tipo">
            <option value="">Todos os tipos</option>
            {Object.entries(ALERT_TYPES).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        {source === null ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-6 w-6 text-brand-400" />
          </div>
        ) : shown.length === 0 ? (
          <EmptyState icon={BellRing} title={tab === 'open' ? 'Nenhum alerta aberto' : 'Nenhum alerta resolvido ainda'}>
            {tab === 'open' ? 'As contas monitoradas estão em ordem.' : null}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {shown.map((a) => (
              <li key={a.id} className={cx('flex items-start gap-3 px-4 py-3', tab === 'resolved' && 'opacity-75')}>
                <SeverityIcon severity={a.severity} className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link to={`/clientes/${a.client_id}?aba=alertas`} className="text-sm font-semibold hover:underline">
                      {a.client_name}
                    </Link>
                    <PlatformBadge platform={a.platform} />
                    <SeverityBadge severity={a.severity} />
                    <span className="muted text-xs">{ALERT_TYPES[a.type] || a.type}</span>
                  </div>
                  <p className="mt-1 text-sm text-brand-700 dark:text-slate-300">{a.message}</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Aberto {dateTimeBR(a.created_at)} ({timeAgo(a.created_at)})
                    {a.emailed_at && ' · avisado por e-mail'}
                    {a.resolved_at && ` · resolvido ${timeAgo(a.resolved_at)} por ${a.resolved_by || '—'}`}
                  </p>
                </div>
                {tab === 'open' && (
                  <button type="button" className="btn-secondary shrink-0 px-2.5 py-1 text-xs" onClick={() => resolve(a)}>
                    <Check className="h-3.5 w-3.5" /> Resolver
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
