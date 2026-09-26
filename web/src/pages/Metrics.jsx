// Números da agência: receita recorrente (soma dos honorários), ticket médio,
// verba sob gestão, funil dos últimos 90 dias, saúde da carteira, receita por
// responsável e cancelamentos. Tudo calculado a partir da ficha dos clientes e
// do funil — não há lançamento financeiro separado (só valores, por decisão).
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Banknote, Briefcase, Clock, Megaphone, Target, TrendingDown, Trophy, Users } from 'lucide-react'
import { api } from '../lib/api.js'
import { useData } from '../lib/data.jsx'
import { OPEN_STAGES } from '../lib/constants.js'
import { money, moneyCompact } from '../lib/format.js'
import { LEVEL_STYLES } from '../lib/urgency.js'
import { useToast } from '../components/Toast.jsx'
import { cx, EmptyState, PageHeader, Spinner, StatTile } from '../components/ui.jsx'

const DAY = 86400000
const fee = (c) => Number(c.fee_monthly) || 0

// Receita recorrente num fim de mês: clientes que já tinham começado e ainda
// não tinham cancelado. Pausado conta nos meses passados (estava pagando) mas
// não no mês atual. Sem data de início, vale a data de cadastro.
function mrrAt(clients, monthEnd, isCurrent) {
  return clients.reduce((sum, c) => {
    if (!fee(c)) return sum
    if (isCurrent && c.status !== 'active') return sum
    const start = c.contract_start ? new Date(`${c.contract_start}T12:00:00`) : new Date(c.created_at)
    if (start > monthEnd) return sum
    if (c.status === 'churned' && (!c.churned_at || new Date(c.churned_at) <= monthEnd)) return sum
    return sum + fee(c)
  }, 0)
}

function Section({ title, subtitle, children }) {
  return (
    <section className="card">
      <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h2 className="text-sm font-bold">{title}</h2>
        {subtitle && <p className="muted text-xs">{subtitle}</p>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

// Lista de barras horizontais (uma série só: sem legenda, valor escrito em cada barra).
function BarList({ rows, format = money, empty }) {
  const max = Math.max(...rows.map((r) => r.value), 0)
  if (!rows.length || !max) return <p className="muted text-sm">{empty}</p>
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${format(r.value)}${r.hint ? ` · ${r.hint}` : ''}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate font-semibold text-brand-700 dark:text-slate-200">{r.label}</span>
            <span className="tabular shrink-0 text-brand-600 dark:text-slate-300">
              {format(r.value)}
              {r.hint && <span className="muted"> · {r.hint}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-2 rounded-full bg-brand-800 dark:bg-slate-300" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export default function Metrics() {
  const { clients } = useData()
  const toast = useToast()
  const [leads, setLeads] = useState(null)

  useEffect(() => {
    api('/leads')
      .then((d) => setLeads(d.leads))
      .catch((err) => {
        toast(err.message, 'error')
        setLeads([])
      })
  }, [toast])

  const m = useMemo(() => {
    const active = clients.filter((c) => c.status === 'active')
    const paying = active.filter((c) => fee(c) > 0)
    const mrr = paying.reduce((s, c) => s + fee(c), 0)

    // Últimos 6 meses (o atual conta até hoje).
    const now = new Date()
    const history = Array.from({ length: 6 }, (_, i) => {
      const monthsAgo = 5 - i
      const first = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1)
      const isCurrent = monthsAgo === 0
      const end = isCurrent ? now : new Date(first.getFullYear(), first.getMonth() + 1, 0, 23, 59, 59)
      return {
        label: first.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '').replace(' de ', '/'),
        value: mrrAt(clients, end, isCurrent),
        isCurrent,
      }
    })

    const byOwner = new Map()
    for (const c of paying) {
      const key = c.manager || 'Sem responsável'
      const e = byOwner.get(key) || { value: 0, count: 0 }
      e.value += fee(c)
      e.count++
      byOwner.set(key, e)
    }

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const churned = clients.filter((c) => c.status === 'churned' && c.churned_at && new Date(c.churned_at) >= monthStart)

    const health = { ok: 0, warn: 0, critical: 0 }
    for (const c of active) if (c.health) health[c.health.level]++

    const since = Date.now() - 90 * DAY
    const all = leads || []
    const won = all.filter((l) => l.stage === 'won' && l.won_at && new Date(l.won_at) >= since)
    const lost = all.filter((l) => l.stage === 'lost' && l.lost_at && new Date(l.lost_at) >= since)
    const lostReasons = new Map()
    for (const l of lost) {
      const reason = (l.lost_reason || 'Sem motivo').split(' — ')[0]
      lostReasons.set(reason, (lostReasons.get(reason) || 0) + 1)
    }
    const daysToClose = won.map((l) => (new Date(l.won_at) - new Date(l.created_at)) / DAY).filter((d) => d >= 0)

    return {
      active,
      paying,
      mrr,
      ticket: paying.length ? mrr / paying.length : 0,
      media: active.reduce((s, c) => s + (Number(c.monthly_budget) || 0), 0),
      history,
      byOwner: [...byOwner.entries()].map(([label, e]) => ({ label, value: e.value, hint: `${e.count} cliente(s)` })).sort((a, b) => b.value - a.value),
      churned,
      churnedValue: churned.reduce((s, c) => s + fee(c), 0),
      health,
      open: all.filter((l) => OPEN_STAGES.includes(l.stage)),
      newLeads: all.filter((l) => new Date(l.created_at) >= since).length,
      won,
      wonValue: won.reduce((s, l) => s + (Number(l.fee_proposed) || 0), 0),
      lost,
      rate: won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : null,
      lostReasons: [...lostReasons.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      avgDaysToClose: daysToClose.length ? Math.round(daysToClose.reduce((a, b) => a + b, 0) / daysToClose.length) : null,
      missingFee: active.filter((c) => !fee(c)),
    }
  }, [clients, leads])

  const maxHistory = Math.max(...m.history.map((h) => h.value), 0)
  const healthTotal = m.health.ok + m.health.warn + m.health.critical

  return (
    <>
      <PageHeader title="Números da agência" subtitle="Receita, carteira e funil, calculados a partir das fichas dos clientes e do funil comercial." />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Receita mensal recorrente" value={moneyCompact(m.mrr)} hint={money(m.mrr)} icon={Banknote} />
        <StatTile label="Ticket médio" value={moneyCompact(m.ticket)} hint={`${m.paying.length} cliente(s) com honorário`} icon={Briefcase} />
        <StatTile label="Clientes ativos" value={m.active.length} hint={m.missingFee.length ? `${m.missingFee.length} sem honorário na ficha` : 'todos com honorário'} level={m.missingFee.length ? 'warn' : undefined} icon={Users} />
        <StatTile label="Verba de mídia sob gestão" value={moneyCompact(m.media)} hint="soma das verbas mensais" icon={Megaphone} />
      </div>

      {m.missingFee.length > 0 && (
        <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Sem honorário na ficha (não entram na receita):{' '}
          {m.missingFee.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ', '}
              <Link to={`/clientes/${c.id}`} className="font-semibold underline">
                {c.name}
              </Link>
            </span>
          ))}
          .
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Receita mensal recorrente · últimos 6 meses" subtitle="Soma dos honorários de quem era cliente no fim de cada mês (o mês atual, até hoje).">
          {maxHistory === 0 ? (
            <EmptyState title="Sem honorários cadastrados">Preencha o honorário mensal e a data de início na ficha de cada cliente.</EmptyState>
          ) : (
            <div className="flex h-48 items-end gap-2" role="img" aria-label={`Receita recorrente: ${m.history.map((h) => `${h.label} ${money(h.value)}`).join(', ')}`}>
              {m.history.map((h) => (
                <div key={h.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${h.label}: ${money(h.value)}`}>
                  <span className={cx('tabular text-[11px]', h.isCurrent ? 'font-bold text-brand-800 dark:text-white' : 'text-brand-600 dark:text-slate-300')}>
                    {moneyCompact(h.value)}
                  </span>
                  <div
                    className="w-full max-w-[56px] rounded-t-[4px] bg-brand-800 dark:bg-slate-300"
                    style={{ height: `${Math.max(2, (h.value / maxHistory) * 100 - 18)}%` }}
                  />
                  <span className={cx('text-[11px]', h.isCurrent ? 'font-bold text-brand-800 dark:text-white' : 'muted')}>{h.label}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Saúde da carteira" subtitle="Clientes ativos pela nota de saúde (contato, otimização, alertas, pendências, saldo).">
          {healthTotal === 0 ? (
            <p className="muted text-sm">Nenhum cliente ativo.</p>
          ) : (
            <>
              <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
                {['ok', 'warn', 'critical'].map((lvl) =>
                  m.health[lvl] ? <div key={lvl} className={LEVEL_STYLES[lvl].bar} style={{ width: `${(m.health[lvl] / healthTotal) * 100}%` }} /> : null,
                )}
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-3">
                {[
                  ['ok', 'Saudáveis'],
                  ['warn', 'Atenção'],
                  ['critical', 'Em risco'],
                ].map(([lvl, label]) => (
                  <div key={lvl}>
                    <dt className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 dark:text-slate-300">
                      <span className={cx('h-2 w-2 rounded-full', LEVEL_STYLES[lvl].dot)} aria-hidden="true" />
                      {label}
                    </dt>
                    <dd className="tabular mt-0.5 text-2xl font-bold">{m.health[lvl]}</dd>
                  </div>
                ))}
              </dl>
              {m.health.critical > 0 && (
                <Link to="/clientes" className="mt-3 inline-block text-xs font-semibold text-brand-600 hover:underline dark:text-slate-300">
                  Ver quem está em risco (filtro "Em risco de cancelar") →
                </Link>
              )}
            </>
          )}
        </Section>

        <Section title="Funil comercial · últimos 90 dias">
          {leads === null ? (
            <Spinner className="h-5 w-5 text-brand-400" />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 2xl:grid-cols-4">
                <StatTile label="Leads novos" value={m.newLeads} icon={Target} />
                <StatTile label="Fechados" value={m.won.length} hint={m.wonValue ? `+ ${moneyCompact(m.wonValue)}/mês` : null} level={m.won.length ? 'ok' : undefined} icon={Trophy} />
                <StatTile label="Taxa de fechamento" value={m.rate != null ? `${m.rate}%` : '—'} hint={`${m.lost.length} perdido(s)`} icon={Target} />
                <StatTile label="Tempo até fechar" value={m.avgDaysToClose != null ? `${m.avgDaysToClose}d` : '—'} hint="média, do cadastro ao fechamento" icon={Clock} />
              </div>
              <h3 className="section-title mb-3 mt-5">Por que perdemos</h3>
              <BarList rows={m.lostReasons} format={(v) => `${v} lead(s)`} empty="Nenhum lead perdido nos últimos 90 dias." />
              <p className="muted mt-4 text-xs">
                Em aberto agora: {m.open.length} lead(s), {money(m.open.reduce((s, l) => s + (Number(l.fee_proposed) || 0), 0))}/mês em propostas.{' '}
                <Link to="/funil" className="font-semibold underline">
                  Abrir funil
                </Link>
              </p>
            </>
          )}
        </Section>

        <Section title="Receita por responsável" subtitle="Honorários dos clientes ativos, pelo responsável na ficha.">
          <BarList rows={m.byOwner} empty="Nenhum cliente ativo com honorário." />
          <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
            <h3 className="section-title mb-2 flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" /> Cancelamentos neste mês
            </h3>
            {m.churned.length === 0 ? (
              <p className="muted text-sm">Nenhum cliente encerrado este mês.</p>
            ) : (
              <>
                <p className="text-sm">
                  <span className="font-bold">{m.churned.length}</span> cliente(s), <span className="font-bold">{money(m.churnedValue)}/mês</span> a menos na receita.
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {m.churned.map((c) => (
                    <li key={c.id}>
                      <Link to={`/clientes/${c.id}`} className="hover:underline">
                        {c.name}
                      </Link>
                      <span className="muted"> · {money(fee(c))}/mês</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Section>
      </div>
    </>
  )
}
