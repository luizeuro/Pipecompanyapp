// Relatórios: tudo o que a equipe e o agente (Hermes) publicaram — relatórios
// semanais dos clientes, análises das contas e o resumo diário da agência.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { api } from '../lib/api.js'
import { useData } from '../lib/data.jsx'
import { REPORT_KINDS } from '../lib/constants.js'
import { normalizeSearch } from '../lib/format.js'
import { usePersistentState } from '../lib/usePersistentState.js'
import ReportForm from '../components/ReportForm.jsx'
import ReportsList from '../components/ReportsList.jsx'
import { useToast } from '../components/Toast.jsx'
import { isAgent, PageHeader, Spinner } from '../components/ui.jsx'

export default function Reports() {
  const { clients } = useData()
  const toast = useToast()
  const [reports, setReports] = useState(null)
  const [creating, setCreating] = useState(false)
  const [filters, setFilters] = usePersistentState('pc-filters-reports', { kind: '', client: '', author: '', search: '' })

  const load = useCallback(async () => {
    try {
      setReports((await api('/reports?limit=300')).reports)
    } catch (err) {
      toast(err.message, 'error')
      setReports([])
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const shown = useMemo(() => {
    if (!reports) return []
    const q = normalizeSearch(filters.search)
    return reports.filter(
      (r) =>
        (!filters.kind || r.kind === filters.kind) &&
        (!filters.client || (filters.client === 'agencia' ? !r.client_id : r.client_id === filters.client)) &&
        (!filters.author || (filters.author === 'agente' ? isAgent(r.created_by) : !isAgent(r.created_by))) &&
        (!q || normalizeSearch(`${r.title} ${r.content} ${r.client_name || ''}`).includes(q)),
    )
  }, [reports, filters])

  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }))

  return (
    <>
      <PageHeader
        title="Relatórios"
        subtitle="Relatórios dos clientes, análises das contas e resumos do dia, feitos pela equipe ou pelo Hermes."
        actions={
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Novo relatório
          </button>
        }
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input type="search" className="input" placeholder="Buscar no título ou no texto…" value={filters.search} onChange={set('search')} aria-label="Buscar relatório" />
        <select className="input" value={filters.kind} onChange={set('kind')} aria-label="Filtrar por tipo">
          <option value="">Todos os tipos</option>
          {REPORT_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        <select className="input" value={filters.client} onChange={set('client')} aria-label="Filtrar por cliente">
          <option value="">Todos os clientes</option>
          <option value="agencia">Agência (geral)</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="input" value={filters.author} onChange={set('author')} aria-label="Filtrar por autor">
          <option value="">Equipe e agente</option>
          <option value="agente">Só do agente (Hermes)</option>
          <option value="equipe">Só da equipe</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        {reports === null ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-6 w-6 text-brand-400" />
          </div>
        ) : (
          <>
            {reports.length > 0 && (
              <div className="muted border-b border-slate-100 px-4 py-2 text-xs tabular dark:border-slate-800">
                {shown.length} de {reports.length} relatórios
              </div>
            )}
            <ReportsList
              reports={shown}
              showClient
              onChanged={load}
              emptyText="Quando o Hermes rodar o relatório semanal ou a análise das contas, eles aparecem aqui."
            />
          </>
        )}
      </div>

      <ReportForm open={creating} onClose={() => setCreating(false)} onSaved={load} />
    </>
  )
}
