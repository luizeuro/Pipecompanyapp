// Funil comercial: quadro com as etapas abertas (arrastar o cartão muda a
// etapa), resumo do funil e, embaixo, quem fechou e quem foi perdido nos
// últimos 90 dias.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, Filter, Handshake, Plus, Target, Trophy, XCircle } from 'lucide-react'
import { api } from '../lib/api.js'
import { useData } from '../lib/data.jsx'
import { usePersistentState } from '../lib/usePersistentState.js'
import { LEAD_STAGES, OPEN_STAGES, stageLabel } from '../lib/constants.js'
import { dateShort, daysUntil, money, moneyCompact, normalizeSearch, relativeDay } from '../lib/format.js'
import LeadDetail from '../components/LeadDetail.jsx'
import LeadForm from '../components/LeadForm.jsx'
import { useToast } from '../components/Toast.jsx'
import { cx, EmptyState, PageHeader, Spinner, StatTile } from '../components/ui.jsx'

const DAY = 86400000

function LeadCard({ lead, onOpen, onDragStart, onDragEnd, dragging }) {
  const due = daysUntil(lead.next_step_at)
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', lead.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart(lead.id)
      }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(lead.id)}
      className={cx(
        'card block w-full cursor-grab p-3 text-left transition hover:border-brand-300 active:cursor-grabbing dark:hover:border-slate-600',
        dragging && 'opacity-40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-brand-800 dark:text-white">{lead.company}</span>
        {lead.fee_proposed != null && <span className="tabular shrink-0 text-xs font-bold">{moneyCompact(lead.fee_proposed)}</span>}
      </div>
      {(lead.contact_name || lead.source) && (
        <p className="muted mt-0.5 truncate text-xs">{[lead.contact_name, lead.source].filter(Boolean).join(' · ')}</p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
        {lead.next_step_at ? (
          <span
            className={cx(
              'inline-flex min-w-0 items-center gap-1 truncate rounded px-1.5 py-0.5',
              due < 0
                ? 'bg-rose-100 font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                : due === 0
                  ? 'bg-amber-100 font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
            )}
            title={lead.next_step || ''}
          >
            <CalendarClock className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{lead.next_step ? `${lead.next_step} · ` : ''}{relativeDay(lead.next_step_at)}</span>
          </span>
        ) : (
          <span className="text-slate-400">sem próximo passo</span>
        )}
        {lead.owner && (
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700 dark:bg-slate-800 dark:text-slate-200"
            title={lead.owner}
          >
            {lead.owner[0]?.toUpperCase()}
          </span>
        )}
      </div>
    </button>
  )
}

export default function Funnel() {
  const { users, refresh: refreshShared } = useData()
  const toast = useToast()
  const [leads, setLeads] = useState(null)
  const [filters, setFilters] = usePersistentState('pc-filters-funnel', { search: '', owner: '' })
  const [openLead, setOpenLead] = useState(null)
  const [newLeadStage, setNewLeadStage] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [dropStage, setDropStage] = useState(null)

  const load = useCallback(async () => {
    try {
      setLeads((await api('/leads')).leads)
    } catch (err) {
      toast(err.message, 'error')
      setLeads([])
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  // Mudanças no funil também mexem na tela Hoje e na lista de clientes (ao fechar).
  const reloadAll = useCallback(() => Promise.all([load(), refreshShared()]), [load, refreshShared])

  const filtered = useMemo(() => {
    if (!leads) return []
    const q = normalizeSearch(filters.search)
    return leads.filter(
      (l) =>
        (!filters.owner || l.owner === filters.owner) &&
        (!q || normalizeSearch(`${l.company} ${l.contact_name || ''} ${l.segment || ''}`).includes(q)),
    )
  }, [leads, filters])

  const columns = useMemo(() => {
    const byStage = Object.fromEntries(OPEN_STAGES.map((s) => [s, []]))
    for (const l of filtered) if (byStage[l.stage]) byStage[l.stage].push(l)
    // Próximo passo mais urgente primeiro; sem data vai pro fim.
    for (const list of Object.values(byStage)) {
      list.sort((a, b) => (a.next_step_at || '9999').localeCompare(b.next_step_at || '9999'))
    }
    return byStage
  }, [filtered])

  const stats = useMemo(() => {
    const all = leads || []
    const open = all.filter((l) => OPEN_STAGES.includes(l.stage))
    const since = Date.now() - 90 * DAY
    const won = all.filter((l) => l.stage === 'won' && l.won_at && new Date(l.won_at) >= since)
    const lost = all.filter((l) => l.stage === 'lost' && l.lost_at && new Date(l.lost_at) >= since)
    return {
      open,
      pipeline: open.reduce((s, l) => s + (Number(l.fee_proposed) || 0), 0),
      won,
      lost,
      wonValue: won.reduce((s, l) => s + (Number(l.fee_proposed) || 0), 0),
      rate: won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : null,
      overdue: open.filter((l) => l.next_step_at && daysUntil(l.next_step_at) < 0).length,
      noNext: open.filter((l) => !l.next_step_at).length,
    }
  }, [leads])

  const owners = useMemo(
    () => [...new Set([...users.map((u) => u.name), ...(leads || []).map((l) => l.owner).filter(Boolean)])].sort(),
    [users, leads],
  )

  async function moveTo(leadId, stage) {
    const lead = leads.find((l) => l.id === leadId)
    if (!lead || lead.stage === stage) return
    // Atualiza a tela na hora; se a API recusar, recarrega do servidor.
    setLeads((list) => list.map((l) => (l.id === leadId ? { ...l, stage } : l)))
    try {
      await api(`/leads/${leadId}`, { method: 'PATCH', body: { stage } })
      toast(`${lead.company} → ${stageLabel(stage)}`)
      reloadAll()
    } catch (err) {
      toast(err.message, 'error')
      load()
    }
  }

  const closed = [...stats.won, ...stats.lost].sort(
    (a, b) => new Date(b.won_at || b.lost_at) - new Date(a.won_at || a.lost_at),
  )

  return (
    <>
      <PageHeader
        title="Funil comercial"
        subtitle="Arraste o cartão para mudar de etapa. Clique para ver o histórico, registrar contato ou fechar."
        actions={
          <button type="button" className="btn-primary" onClick={() => setNewLeadStage('lead')}>
            <Plus className="h-4 w-4" /> Novo lead
          </button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Em negociação" value={stats.open.length} hint={`${money(stats.pipeline)}/mês em propostas`} icon={Handshake} />
        <StatTile
          label="Fechados (90 dias)"
          value={stats.won.length}
          hint={stats.wonValue ? `+ ${money(stats.wonValue)}/mês` : 'nenhum ainda'}
          level={stats.won.length ? 'ok' : undefined}
          icon={Trophy}
        />
        <StatTile
          label="Taxa de fechamento"
          value={stats.rate != null ? `${stats.rate}%` : '—'}
          hint={`${stats.won.length} fechado(s) de ${stats.won.length + stats.lost.length} decidido(s) em 90 dias`}
          icon={Target}
        />
        <StatTile
          label="Próximos passos atrasados"
          value={stats.overdue}
          hint={stats.noNext ? `${stats.noNext} lead(s) sem próximo passo` : 'todos com próximo passo'}
          level={stats.overdue ? 'critical' : stats.noNext ? 'warn' : 'ok'}
          icon={CalendarClock}
        />
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          className="input sm:max-w-xs"
          placeholder="Buscar empresa, contato ou segmento…"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          aria-label="Buscar lead"
        />
        <div className="relative sm:w-56">
          <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <select className="input pl-9" value={filters.owner} onChange={(e) => setFilters({ ...filters, owner: e.target.value })} aria-label="Filtrar por responsável">
            <option value="">Todos os responsáveis</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      </div>

      {leads === null ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6 text-brand-400" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {OPEN_STAGES.map((stage) => {
            const list = columns[stage]
            const meta = LEAD_STAGES.find((s) => s.id === stage)
            const total = list.reduce((s, l) => s + (Number(l.fee_proposed) || 0), 0)
            return (
              <section
                key={stage}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDropStage(stage)
                }}
                onDragLeave={() => setDropStage((s) => (s === stage ? null : s))}
                onDrop={(e) => {
                  e.preventDefault()
                  setDropStage(null)
                  moveTo(e.dataTransfer.getData('text/plain') || dragId, stage)
                }}
                className={cx(
                  'flex min-h-[200px] flex-col rounded-xl border bg-slate-50/70 p-2 transition dark:bg-slate-900/40',
                  dropStage === stage ? 'border-brand-500 bg-brand-50 dark:border-slate-400 dark:bg-slate-800/60' : 'border-slate-200 dark:border-slate-800',
                )}
                aria-label={`Etapa ${meta.label}`}
              >
                <header className="mb-2 flex items-center justify-between gap-2 px-1.5 pt-1">
                  <div>
                    <h2 className="text-sm font-bold">
                      {meta.label} <span className="muted tabular font-semibold">· {list.length}</span>
                    </h2>
                    <p className="muted text-[11px]">{total ? `${moneyCompact(total)}/mês` : meta.hint}</p>
                  </div>
                  <button type="button" className="icon-btn" onClick={() => setNewLeadStage(stage)} aria-label={`Novo lead em ${meta.label}`}>
                    <Plus className="h-4 w-4" />
                  </button>
                </header>
                <div className="scroll-thin flex max-h-[60vh] flex-col gap-2 overflow-y-auto p-0.5">
                  {list.map((l) => (
                    <LeadCard
                      key={l.id}
                      lead={l}
                      onOpen={setOpenLead}
                      onDragStart={setDragId}
                      onDragEnd={() => setDragId(null)}
                      dragging={dragId === l.id}
                    />
                  ))}
                  {!list.length && <p className="muted px-2 py-6 text-center text-xs">Arraste um cartão para cá</p>}
                </div>
              </section>
            )
          })}
        </div>
      )}

      <section className="card mt-6">
        <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <h2 className="text-sm font-bold">Fechados e perdidos nos últimos 90 dias</h2>
        </div>
        {closed.length === 0 ? (
          <EmptyState title="Nenhuma decisão nos últimos 90 dias" />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {closed.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                {l.stage === 'won' ? (
                  <Trophy className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Fechado" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 text-rose-500" aria-label="Perdido" />
                )}
                <button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-semibold hover:underline" onClick={() => setOpenLead(l.id)}>
                  {l.company}
                </button>
                <span className="muted hidden truncate text-xs sm:block">
                  {l.stage === 'won' ? (l.fee_proposed ? `${money(l.fee_proposed)}/mês` : 'Fechado') : l.lost_reason || 'Perdido'}
                </span>
                {l.stage === 'won' && l.client_id && (
                  <Link to={`/clientes/${l.client_id}`} className="text-xs font-semibold text-brand-600 hover:underline dark:text-slate-300">
                    ficha
                  </Link>
                )}
                <span className="tabular w-14 shrink-0 text-right text-xs text-slate-400">{dateShort(l.won_at || l.lost_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <LeadForm open={Boolean(newLeadStage)} defaultStage={newLeadStage || 'lead'} onClose={() => setNewLeadStage(null)} onSaved={reloadAll} />
      {openLead && <LeadDetail leadId={openLead} onClose={() => setOpenLead(null)} onChanged={reloadAll} />}
    </>
  )
}
