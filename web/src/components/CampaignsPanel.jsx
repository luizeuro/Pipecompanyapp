// Campanhas da conta Meta do cliente, consultadas na hora (só leitura):
// status, orçamento, gasto e resultado dos últimos 7 dias e se o custo por
// resultado subiu ou caiu contra os 7 dias anteriores.
import { useCallback, useEffect, useState } from 'react'
import { AlertOctagon, AlertTriangle, ExternalLink, Megaphone, RefreshCw, Rocket, TrendingDown, TrendingUp } from 'lucide-react'
import { api } from '../lib/api.js'
import { money, number } from '../lib/format.js'
import { cx, EmptyState, LevelBadge, Spinner } from './ui.jsx'

const STATUS_LEVEL = { active: 'ok', issue: 'critical', review: 'warn', paused: 'never', other: 'never' }
// Variação menor que isso é ruído de uma semana pra outra.
const CHANGE_THRESHOLD = 10

function budgetText(c) {
  if (c.daily_budget) return `${money(c.daily_budget)}/dia`
  if (c.lifetime_budget) {
    const rest = c.budget_remaining != null ? ` · resta ${money(c.budget_remaining)}` : ''
    return `${money(c.lifetime_budget)} no total${rest}`
  }
  return 'orçamento nos conjuntos'
}

function CostChange({ pct }) {
  if (pct == null) return null
  if (Math.abs(pct) < CHANGE_THRESHOLD) return <span className="muted text-[11px]">estável</span>
  const up = pct > 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span
      className={cx(
        'inline-flex items-center gap-0.5 text-[11px] font-semibold',
        up ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300',
      )}
      title={up ? 'Custo por resultado subiu contra os 7 dias anteriores' : 'Custo por resultado caiu contra os 7 dias anteriores'}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {up ? '+' : '−'}
      {Math.abs(pct)}%
    </span>
  )
}

function Metric({ label, children, hint }) {
  return (
    <div className="min-w-0">
      <dt className="muted text-[11px]">{label}</dt>
      <dd className="tabular text-sm font-semibold text-brand-800 dark:text-slate-100">{children}</dd>
      {hint && <dd className="mt-0.5">{hint}</dd>}
    </div>
  )
}

const REC_STYLE = {
  critical: { icon: AlertOctagon, cls: 'border-rose-300/70 bg-rose-50 text-rose-800 dark:border-rose-400/25 dark:bg-rose-500/[0.08] dark:text-rose-200' },
  warn: { icon: AlertTriangle, cls: 'border-amber-300/70 bg-amber-50 text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/[0.07] dark:text-amber-100' },
  good: { icon: Rocket, cls: 'border-emerald-300/70 bg-emerald-50 text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-500/[0.08] dark:text-emerald-200' },
}

function Recommendations({ list }) {
  if (!list?.length) return null
  return (
    <ul className="space-y-1.5 md:col-span-2">
      {list.map((r) => {
        const { icon: Icon, cls } = REC_STYLE[r.level] || REC_STYLE.warn
        return (
          <li key={r.code} className={cx('flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-xs', cls)}>
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{r.text}</span>
          </li>
        )
      })}
    </ul>
  )
}

function CampaignRow({ c, target }) {
  const aboveTarget = target != null && c.cost_per_result != null && c.cost_per_result > target
  return (
    <li className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] md:items-center">
      <div className="min-w-0">
        <p className="truncate font-semibold text-brand-800 dark:text-slate-100" title={c.name}>
          {c.name}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <LevelBadge level={STATUS_LEVEL[c.status]}>{c.status_label}</LevelBadge>
          {c.objective && <span className="muted">{c.objective}</span>}
          <span className="muted">· {budgetText(c)}</span>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
        <Metric label="Gasto 7 dias">{money(c.spend_7d)}</Metric>
        <Metric label={c.result_label ? `${c.result_label} 7 dias` : 'Resultados 7 dias'}>
          {c.results_7d != null ? number(c.results_7d) : '—'}
        </Metric>
        <Metric label={target != null ? `Custo · meta ${money(target)}` : 'Custo por resultado'} hint={<CostChange pct={c.cost_change_pct} />}>
          <span className={cx(aboveTarget && 'text-rose-700 dark:text-rose-300', target != null && !aboveTarget && c.cost_per_result != null && 'text-emerald-700 dark:text-emerald-300')}>
            {c.cost_per_result != null ? money(c.cost_per_result) : '—'}
          </span>
        </Metric>
        <Metric label="Frequência">
          <span className={cx(c.frequency_7d >= 4 && 'text-amber-700 dark:text-amber-300')} title={c.frequency_7d >= 4 ? 'Frequência alta: o público pode estar saturando' : undefined}>
            {c.frequency_7d != null ? number(c.frequency_7d, 1) : '—'}
          </span>
        </Metric>
      </dl>
      <Recommendations list={c.recommendations} />
    </li>
  )
}

export default function CampaignsPanel({ clientId, metaAccountId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showPaused, setShowPaused] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api(`/clients/${clientId}/campaigns`))
    } catch (err) {
      setData({ ok: false, error: err.message, campaigns: [] })
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    load()
  }, [load])

  if (!metaAccountId) {
    return (
      <EmptyState icon={Megaphone} title="Sem conta Meta">
        Cadastre o ID da conta de anúncios do Meta na ficha (Editar) para ver as campanhas aqui.
      </EmptyState>
    )
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-brand-500 dark:text-slate-400">
        <Spinner /> Buscando campanhas no Meta…
      </div>
    )
  }
  if (!data.ok) {
    return (
      <EmptyState
        icon={Megaphone}
        title="Não deu para buscar as campanhas"
        action={
          <button type="button" className="btn-secondary" onClick={load} disabled={loading}>
            {loading ? <Spinner /> : <RefreshCw className="h-4 w-4" />} Tentar de novo
          </button>
        }
      >
        {data.error}
      </EmptyState>
    )
  }

  // Pausada sem gasto na semana só aparece se pedir: o que importa é o que está rodando.
  const visible = data.campaigns.filter((c) => showPaused || c.status !== 'paused' || c.spend_7d > 0)
  const hidden = data.campaigns.length - visible.length
  const managerUrl = `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${metaAccountId}`

  return (
    <div>
      {data.recommendations && (data.recommendations.critical > 0 || data.recommendations.warn > 0 || data.recommendations.good > 0) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/[0.06]">
          <span className="eyebrow mr-1">Recomendações</span>
          {data.recommendations.critical > 0 && (
            <span className="chip !border-rose-300/70 !text-rose-700 dark:!border-rose-400/30 dark:!text-rose-300">{data.recommendations.critical} resolver hoje</span>
          )}
          {data.recommendations.warn > 0 && (
            <span className="chip !border-amber-300/70 !text-amber-800 dark:!border-amber-400/30 dark:!text-amber-200">{data.recommendations.warn} nesta semana</span>
          )}
          {data.recommendations.good > 0 && (
            <span className="chip !border-emerald-300/70 !text-emerald-700 dark:!border-emerald-400/30 dark:!text-emerald-300">{data.recommendations.good} pra escalar</span>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 text-xs dark:border-white/[0.06]">
        <span className="eyebrow">Últimos 7 dias vs. 7 anteriores · Meta Ads</span>
        <div className="flex flex-wrap items-center gap-1">
          {(hidden > 0 || showPaused) && (
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setShowPaused((v) => !v)}>
              {showPaused ? 'Esconder pausadas sem gasto' : `Mostrar pausadas (${hidden})`}
            </button>
          )}
          <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={load} disabled={loading}>
            {loading ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />} Atualizar
          </button>
          <a className="btn-ghost px-2 py-1 text-xs" href={managerUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> Gerenciador
          </a>
        </div>
      </div>
      {visible.length ? (
        <ul className="divide-y divide-slate-100 dark:divide-white/[0.05]">
          {visible.map((c) => (
            <CampaignRow key={c.id} c={c} target={data.target_cpr} />
          ))}
        </ul>
      ) : (
        <EmptyState icon={Megaphone} title="Nenhuma campanha rodando">
          {hidden ? 'Só há campanhas pausadas sem gasto na semana.' : 'A conta não tem campanhas ativas ou pausadas.'}
        </EmptyState>
      )}
      {data.capped && <p className="muted px-4 py-2 text-[11px]">Mostrando as primeiras 200 campanhas da conta.</p>}
    </div>
  )
}
