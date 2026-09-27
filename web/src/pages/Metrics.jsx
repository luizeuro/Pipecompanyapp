// Números da agência: receita recorrente (soma dos honorários), ticket médio,
// verba sob gestão, funil dos últimos 90 dias, saúde da carteira, receita por
// responsável e cancelamentos. O cálculo é do backend (lib/metrics.js, rota
// /api/metrics) — o mesmo que o Hermes lê pela ferramenta numeros_agencia.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Banknote, Briefcase, Clock, Megaphone, Target, TrendingDown, Trophy, Users } from 'lucide-react'
import { api } from '../lib/api.js'
import { money, moneyCompact } from '../lib/format.js'
import { LEVEL_STYLES } from '../lib/urgency.js'
import { useToast } from '../components/Toast.jsx'
import { cx, EmptyState, PageHeader, Spinner, StatTile } from '../components/ui.jsx'

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
  const toast = useToast()
  const [m, setM] = useState(null)

  useEffect(() => {
    api('/metrics')
      .then(setM)
      .catch((err) => toast(err.message, 'error'))
  }, [toast])

  if (!m) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-6 w-6 text-brand-400" />
      </div>
    )
  }

  const f = m.funnel
  const maxHistory = Math.max(...m.history.map((h) => h.value), 0)
  const healthTotal = m.health.ok + m.health.warn + m.health.critical

  return (
    <>
      <PageHeader title="Números da agência" subtitle="Receita, carteira e funil, calculados a partir das fichas dos clientes e do funil comercial." />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Receita mensal recorrente" value={moneyCompact(m.mrr)} hint={money(m.mrr)} icon={Banknote} />
        <StatTile label="Ticket médio" value={moneyCompact(m.ticket)} hint={`${m.paying_count} cliente(s) com honorário`} icon={Briefcase} />
        <StatTile
          label="Clientes ativos"
          value={m.active_count}
          hint={m.missing_fee.length ? `${m.missing_fee.length} sem honorário na ficha` : 'todos com honorário'}
          level={m.missing_fee.length ? 'warn' : undefined}
          icon={Users}
        />
        <StatTile label="Verba de mídia sob gestão" value={moneyCompact(m.media_budget_total)} hint="soma das verbas mensais" icon={Megaphone} />
      </div>

      {m.missing_fee.length > 0 && (
        <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Sem honorário na ficha (não entram na receita):{' '}
          {m.missing_fee.map((c, i) => (
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
                  <span className={cx('tabular text-[11px]', h.is_current ? 'font-bold text-brand-800 dark:text-white' : 'text-brand-600 dark:text-slate-300')}>
                    {moneyCompact(h.value)}
                  </span>
                  <div className="w-full max-w-[56px] rounded-t-[4px] bg-brand-800 dark:bg-slate-300" style={{ height: `${Math.max(2, (h.value / maxHistory) * 100 - 18)}%` }} />
                  <span className={cx('text-[11px]', h.is_current ? 'font-bold text-brand-800 dark:text-white' : 'muted')}>{h.label}</span>
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
          <div className="grid grid-cols-2 gap-3 2xl:grid-cols-4">
            <StatTile label="Leads novos" value={f.new_leads_90d} icon={Target} />
            <StatTile label="Fechados" value={f.won_90d} hint={f.won_value_90d ? `+ ${moneyCompact(f.won_value_90d)}/mês` : null} level={f.won_90d ? 'ok' : undefined} icon={Trophy} />
            <StatTile label="Taxa de fechamento" value={f.close_rate != null ? `${f.close_rate}%` : '—'} hint={`${f.lost_90d} perdido(s)`} icon={Target} />
            <StatTile label="Tempo até fechar" value={f.avg_days_to_close != null ? `${f.avg_days_to_close}d` : '—'} hint="média, do cadastro ao fechamento" icon={Clock} />
          </div>
          <h3 className="section-title mb-3 mt-5">Por que perdemos</h3>
          <BarList rows={f.lost_reasons} format={(v) => `${v} lead(s)`} empty="Nenhum lead perdido nos últimos 90 dias." />
          <p className="muted mt-4 text-xs">
            Em aberto agora: {f.open_count} lead(s), {money(f.open_value)}/mês em propostas.{' '}
            <Link to="/funil" className="font-semibold underline">
              Abrir funil
            </Link>
          </p>
        </Section>

        <Section title="Receita por responsável" subtitle="Honorários dos clientes ativos, pelo responsável na ficha.">
          <BarList rows={m.by_owner.map((o) => ({ label: o.label, value: o.value, hint: `${o.clients} cliente(s)` }))} empty="Nenhum cliente ativo com honorário." />
          <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
            <h3 className="section-title mb-2 flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" /> Cancelamentos neste mês
            </h3>
            {m.churned.length === 0 ? (
              <p className="muted text-sm">Nenhum cliente encerrado este mês.</p>
            ) : (
              <>
                <p className="text-sm">
                  <span className="font-bold">{m.churned.length}</span> cliente(s), <span className="font-bold">{money(m.churned_value)}/mês</span> a menos na receita.
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {m.churned.map((c) => (
                    <li key={c.id}>
                      <Link to={`/clientes/${c.id}`} className="hover:underline">
                        {c.name}
                      </Link>
                      <span className="muted"> · {money(c.fee)}/mês</span>
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
