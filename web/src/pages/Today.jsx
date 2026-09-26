// Hoje: a tela de abertura do CRM. Junta numa agenda só os follow-ups dos
// clientes, os próximos passos do funil e as pendências com prazo, e ao lado
// mostra quem precisa de atenção (risco, sem contato, renovação, cobrança).
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertOctagon, CalendarClock, CalendarDays, Check, ListTodo, MessageSquarePlus, PhoneOff, Plus, Receipt, RefreshCcw, Target, Wallet } from 'lucide-react'
import { api } from '../lib/api.js'
import { useData } from '../lib/data.jsx'
import { isNoContact, isLowBalance } from '../lib/clientFilters.js'
import { dateShort, daysUntil, money, relativeDay } from '../lib/format.js'
import { kindLabel } from '../lib/constants.js'
import { daysSince } from '../lib/urgency.js'
import InteractionForm from '../components/InteractionForm.jsx'
import LeadDetail from '../components/LeadDetail.jsx'
import LeadForm from '../components/LeadForm.jsx'
import { useToast } from '../components/Toast.jsx'
import { cx, EmptyState, HealthBadge, LastContactBadge, PageHeader, Spinner, StatTile } from '../components/ui.jsx'

const TYPE_META = {
  followup: { label: 'Follow-up', icon: MessageSquarePlus },
  lead: { label: 'Funil', icon: Target },
  pendencia: { label: 'Pendência', icon: ListTodo },
}

// Próxima data de cobrança a partir do dia do mês (dia 31 vira o último dia em meses curtos).
function nextBillingDate(day) {
  const now = new Date()
  const make = (y, m) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()), 12)
  let d = make(now.getFullYear(), now.getMonth())
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  if (d < today) d = make(now.getFullYear(), now.getMonth() + 1)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function SideCard({ title, icon: Icon, count, children, tone }) {
  return (
    <section className="card">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <Icon className={cx('h-4 w-4', tone || 'text-brand-400')} aria-hidden="true" />
        <h2 className="flex-1 text-sm font-semibold">{title}</h2>
        <span className="tabular rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">{count}</span>
      </div>
      {children}
    </section>
  )
}

export default function Today() {
  const { clients, today, loading, refresh } = useData()
  const toast = useToast()
  const [contactFor, setContactFor] = useState(null) // { clientId | leadId, name }
  const [openLead, setOpenLead] = useState(null)
  const [newLead, setNewLead] = useState(false)
  const [busyId, setBusyId] = useState(null)

  // Agenda única: follow-up de cliente/lead + próximo passo do funil + pendência.
  const agenda = useMemo(() => {
    if (!today) return { overdue: [], today: [], week: [], noNext: [] }
    const items = [
      ...today.followups.map((f) => ({
        key: `f-${f.id}`,
        type: 'followup',
        date: f.next_step_at,
        title: f.next_step || 'Retornar',
        detail: `${kindLabel(f.kind)}: ${f.summary}`,
        target: f.target_name,
        href: f.client_id ? `/clientes/${f.client_id}` : null,
        leadId: f.client_id ? null : f.lead_id,
        raw: f,
      })),
      ...today.leads
        .filter((l) => l.next_step_at)
        .map((l) => ({
          key: `l-${l.id}`,
          type: 'lead',
          date: l.next_step_at,
          title: l.next_step || 'Próximo passo',
          detail: l.fee_proposed ? `Proposta de ${money(l.fee_proposed)}/mês` : null,
          target: l.company,
          leadId: l.id,
          raw: l,
        })),
      ...today.pendencias.map((p) => ({
        key: `p-${p.id}`,
        type: 'pendencia',
        date: p.due_date,
        title: p.title,
        detail: p.assignee ? `Responsável: ${p.assignee}` : null,
        target: p.client_name,
        href: `/clientes/${p.client_id}?aba=pendencias`,
        raw: p,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date))
    const t = today.today
    return {
      overdue: items.filter((i) => i.date < t),
      today: items.filter((i) => i.date === t),
      week: items.filter((i) => i.date > t),
      noNext: today.leads.filter((l) => !l.next_step_at),
    }
  }, [today])

  const active = clients.filter((c) => c.status === 'active')
  const atRisk = active
    .filter((c) => c.health && c.health.level !== 'ok')
    .sort((a, b) => a.health.score - b.health.score)
  const noContact = active
    .filter(isNoContact)
    .sort((a, b) => (daysSince(b.last_contact_at) ?? 9999) - (daysSince(a.last_contact_at) ?? 9999))
  const renewals = active
    .filter((c) => c.renewal_date && daysUntil(c.renewal_date) <= 30)
    .sort((a, b) => a.renewal_date.localeCompare(b.renewal_date))
  const billing = active
    .filter((c) => c.billing_day && c.fee_monthly)
    .map((c) => ({ ...c, next_billing: nextBillingDate(c.billing_day) }))
    .filter((c) => daysUntil(c.next_billing) <= 7)
    .sort((a, b) => a.next_billing.localeCompare(b.next_billing))
  const lowBalance = active.filter(isLowBalance)

  async function complete(item) {
    setBusyId(item.key)
    try {
      if (item.type === 'followup') {
        await api(`/interactions/${item.raw.id}`, { method: 'PATCH', body: { next_step_done: true } })
      } else if (item.type === 'pendencia') {
        await api(`/pendencias/${item.raw.id}`, { method: 'PATCH', body: { status: 'done' } })
      }
      toast('Feito ✓')
      await refresh()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusyId(null)
    }
  }

  function AgendaItem({ item, tone }) {
    const meta = TYPE_META[item.type]
    const Icon = meta.icon
    return (
      <li className="flex items-start gap-3 px-4 py-3">
        <div
          className={cx(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
            tone === 'overdue'
              ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
              : tone === 'today'
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-brand-800 dark:text-white">{item.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs">
            {item.href ? (
              <Link to={item.href} className="font-semibold text-brand-600 hover:underline dark:text-slate-300">
                {item.target}
              </Link>
            ) : (
              <button type="button" className="font-semibold text-brand-600 hover:underline dark:text-slate-300" onClick={() => setOpenLead(item.leadId)}>
                {item.target}
              </button>
            )}
            <span className="text-slate-400">· {meta.label}</span>
            <span className={cx('tabular', tone === 'overdue' ? 'font-semibold text-rose-600 dark:text-rose-300' : 'text-slate-400')}>
              · {dateShort(item.date)} ({relativeDay(item.date)})
            </span>
          </p>
          {item.detail && <p className="muted mt-0.5 line-clamp-2 text-xs">{item.detail}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          {item.type !== 'pendencia' && (
            <button
              type="button"
              className="icon-btn"
              title="Registrar contato"
              aria-label="Registrar contato"
              onClick={() =>
                setContactFor(item.href && item.type === 'followup' ? { clientId: item.raw.client_id, name: item.target } : { leadId: item.leadId, name: item.target })
              }
            >
              <MessageSquarePlus className="h-4 w-4" />
            </button>
          )}
          {item.type === 'lead' ? (
            <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={() => setOpenLead(item.leadId)}>
              Abrir
            </button>
          ) : (
            <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={() => complete(item)} disabled={busyId === item.key}>
              {busyId === item.key ? <Spinner className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />} Feito
            </button>
          )}
        </div>
      </li>
    )
  }

  const groups = [
    { id: 'overdue', title: 'Atrasados', items: agenda.overdue },
    { id: 'today', title: 'Para hoje', items: agenda.today },
    { id: 'week', title: 'Próximos 7 dias', items: agenda.week },
  ]
  const weekday = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <>
      <PageHeader
        title="Hoje"
        subtitle={`${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} · o que precisa da Pipe agora`}
        actions={
          <button type="button" className="btn-secondary" onClick={() => setNewLead(true)}>
            <Plus className="h-4 w-4" /> Novo lead
          </button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Atrasados" value={agenda.overdue.length} hint="follow-ups, funil e pendências" level={agenda.overdue.length ? 'critical' : 'ok'} icon={AlertOctagon} />
        <StatTile label="Para hoje" value={agenda.today.length} hint={`${agenda.week.length} nos próximos 7 dias`} level={agenda.today.length ? 'warn' : undefined} icon={CalendarDays} />
        <StatTile label="Clientes em risco" value={atRisk.filter((c) => c.health.level === 'critical').length} hint={`${atRisk.filter((c) => c.health.level === 'warn').length} em atenção`} level={atRisk.some((c) => c.health.level === 'critical') ? 'critical' : atRisk.length ? 'warn' : 'ok'} icon={Target} />
        <StatTile label="Sem contato 15+ dias" value={noContact.length} hint="mesma régua das otimizações" level={noContact.length ? 'warn' : 'ok'} icon={PhoneOff} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0 space-y-4">
          {loading || !today ? (
            <div className="flex justify-center py-16">
              <Spinner className="h-6 w-6 text-brand-400" />
            </div>
          ) : agenda.overdue.length + agenda.today.length + agenda.week.length === 0 ? (
            <div className="card">
              <EmptyState icon={CalendarClock} title="Agenda livre">
                Nada vencendo nos próximos 7 dias. Ao registrar um contato, marque o próximo passo com data: ele aparece aqui.
              </EmptyState>
            </div>
          ) : (
            groups
              .filter((g) => g.items.length)
              .map((g) => (
                <section key={g.id} className="card overflow-hidden">
                  <h2
                    className={cx(
                      'border-b border-slate-100 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.12em] dark:border-slate-800',
                      g.id === 'overdue' ? 'text-rose-600 dark:text-rose-300' : g.id === 'today' ? 'text-amber-700 dark:text-amber-300' : 'muted',
                    )}
                  >
                    {g.title} · {g.items.length}
                  </h2>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {g.items.map((item) => (
                      <AgendaItem key={item.key} item={item} tone={g.id} />
                    ))}
                  </ul>
                </section>
              ))
          )}

          {agenda.noNext.length > 0 && (
            <section className="card">
              <h2 className="border-b border-slate-100 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                Leads sem próximo passo · {agenda.noNext.length}
              </h2>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {agenda.noNext.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <button type="button" className="truncate text-sm font-semibold hover:underline" onClick={() => setOpenLead(l.id)}>
                      {l.company}
                    </button>
                    <span className="muted shrink-0 text-xs">parado {relativeDay(l.updated_at?.slice(0, 10))}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>

        <aside className="space-y-4">
          <SideCard title="Clientes em risco" icon={AlertOctagon} count={atRisk.length} tone={atRisk.some((c) => c.health.level === 'critical') ? 'text-rose-500' : 'text-amber-500'}>
            {atRisk.length === 0 ? (
              <p className="muted px-4 py-3 text-sm">Todos os clientes ativos estão saudáveis.</p>
            ) : (
              <ul className="scroll-thin max-h-[320px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                {atRisk.map((c) => (
                  <li key={c.id} className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <Link to={`/clientes/${c.id}`} className="truncate text-sm font-semibold hover:underline">
                        {c.name}
                      </Link>
                      <HealthBadge health={c.health} showScore />
                    </div>
                    <p className="muted mt-0.5 text-xs">{c.health.reasons.slice(0, 2).join(' · ')}</p>
                  </li>
                ))}
              </ul>
            )}
          </SideCard>

          <SideCard title="Sem contato há 15+ dias" icon={PhoneOff} count={noContact.length}>
            {noContact.length === 0 ? (
              <p className="muted px-4 py-3 text-sm">Todo mundo recebeu contato nos últimos 14 dias.</p>
            ) : (
              <ul className="scroll-thin max-h-[280px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                {noContact.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2">
                    <Link to={`/clientes/${c.id}`} className="min-w-0 truncate text-sm hover:underline">
                      {c.name}
                    </Link>
                    <span className="flex shrink-0 items-center gap-1">
                      <LastContactBadge date={c.last_contact_at} prefix="" />
                      <button type="button" className="icon-btn h-7 w-7" title="Registrar contato" aria-label={`Registrar contato com ${c.name}`} onClick={() => setContactFor({ clientId: c.id, name: c.name })}>
                        <MessageSquarePlus className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SideCard>

          <SideCard title="Renovações em 30 dias" icon={RefreshCcw} count={renewals.length}>
            {renewals.length === 0 ? (
              <p className="muted px-4 py-3 text-sm">Nenhum contrato para renovar no próximo mês.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {renewals.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                    <Link to={`/clientes/${c.id}`} className="truncate hover:underline">
                      {c.name}
                    </Link>
                    <span className={cx('tabular shrink-0 text-xs', daysUntil(c.renewal_date) < 0 ? 'font-semibold text-rose-600 dark:text-rose-300' : 'muted')}>
                      {dateShort(c.renewal_date)} ({relativeDay(c.renewal_date)})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SideCard>

          <SideCard title="Cobranças nos próximos 7 dias" icon={Receipt} count={billing.length}>
            {billing.length === 0 ? (
              <p className="muted px-4 py-3 text-sm">Nenhum honorário vence nesta semana.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {billing.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                    <Link to={`/clientes/${c.id}`} className="truncate hover:underline">
                      {c.name}
                    </Link>
                    <span className="tabular shrink-0 text-xs">
                      <span className="font-semibold">{money(c.fee_monthly)}</span>
                      <span className="muted"> · {relativeDay(c.next_billing)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SideCard>

          {lowBalance.length > 0 && (
            <Link to="/contas" className="card flex items-center gap-3 px-4 py-3 transition hover:border-brand-300 dark:hover:border-slate-600">
              <Wallet className="h-4 w-4 text-rose-500" aria-hidden="true" />
              <span className="flex-1 text-sm font-semibold">{lowBalance.length} cliente(s) com saldo de anúncio acabando</span>
              <span className="text-xs text-brand-600 dark:text-slate-300">ver contas →</span>
            </Link>
          )}
        </aside>
      </div>

      {contactFor && (
        <InteractionForm
          open
          clientId={contactFor.clientId}
          leadId={contactFor.leadId}
          targetName={contactFor.name}
          onClose={() => setContactFor(null)}
          onSaved={refresh}
        />
      )}
      {openLead && <LeadDetail leadId={openLead} onClose={() => setOpenLead(null)} onChanged={refresh} />}
      <LeadForm open={newLead} onClose={() => setNewLead(false)} onSaved={refresh} />
    </>
  )
}
