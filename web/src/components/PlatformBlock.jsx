// Resumo de UMA conta (Meta ou Google) de um cliente: saldo, dias restantes,
// gasto e resultado. `detailed` mostra a versão grande (página do cliente).
import { AlertCircle, CircleSlash, PlugZap } from 'lucide-react'
import { daysLabel, money, number, timeAgo } from '../lib/format.js'
import { BALANCE_SOURCE_LABEL, PLATFORMS } from '../lib/constants.js'
import { cx, LevelBadge } from './ui.jsx'

const COLOR = { meta: 'var(--series-meta)', google: 'var(--series-google)' }

function Header({ platform, snapshot }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-500 dark:text-slate-400">
        <span className="h-2 w-2 rounded-full" style={{ background: COLOR[platform] }} aria-hidden="true" />
        {PLATFORMS[platform].label}
      </span>
      {snapshot?.ok && snapshot.status === 'blocked' && <LevelBadge level="critical">{snapshot.status_label}</LevelBadge>}
    </div>
  )
}

function noBalanceText(platform, s) {
  if (platform === 'meta') return s.payment_type === 'postpaid' ? 'Pós-pago (cartão), sem saldo' : 'Saldo indisponível'
  return 'Pagamento manual: saldo não sai na API'
}

export default function PlatformBlock({ platform, snapshot, level, detailed = false }) {
  const wrap = cx(
    'min-w-0 rounded-lg border p-3',
    level === 'critical'
      ? 'border-rose-200 bg-rose-50/40 dark:border-rose-500/30 dark:bg-rose-500/5'
      : level === 'warn'
        ? 'border-amber-200 bg-amber-50/40 dark:border-amber-500/30 dark:bg-amber-500/5'
        : 'border-slate-200 dark:border-slate-800',
  )

  if (!snapshot) {
    return (
      <div className={wrap}>
        <Header platform={platform} />
        <p className="muted text-sm">Ainda não verificada. Use “Verificar agora”.</p>
      </div>
    )
  }

  if (!snapshot.ok) {
    const notConfigured = snapshot.error_code === 'not_configured'
    const Icon = notConfigured ? PlugZap : AlertCircle
    return (
      <div className={wrap}>
        <Header platform={platform} />
        <p className={cx('flex items-start gap-1.5 text-sm', notConfigured ? 'muted' : 'text-rose-700 dark:text-rose-300')}>
          <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{snapshot.error}</span>
        </p>
        <p className="mt-1 text-[11px] text-slate-400">Tentativa {timeAgo(snapshot.checked_at)}</p>
      </div>
    )
  }

  const s = snapshot
  const hasBalance = s.balance != null
  return (
    <div className={wrap}>
      <Header platform={platform} snapshot={s} />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {hasBalance ? (
          <span className="tabular text-xl font-bold text-brand-800 dark:text-white">{money(s.balance, s.currency)}</span>
        ) : (
          <span className="muted flex items-center gap-1.5 text-sm">
            <CircleSlash className="h-3.5 w-3.5" aria-hidden="true" />
            {noBalanceText(platform, s)}
          </span>
        )}
        {hasBalance && (
          <LevelBadge level={level}>
            {s.days_left != null ? `dura ${daysLabel(s.days_left)}` : level === 'critical' ? 'abaixo do mínimo' : 'sem gasto recente'}
          </LevelBadge>
        )}
      </div>
      {hasBalance && s.balance_source && (
        <p className="muted mt-0.5 text-[11px]">{BALANCE_SOURCE_LABEL[s.balance_source]}</p>
      )}

      <dl className={cx('mt-3 grid gap-x-3 gap-y-2 text-xs', detailed ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2')}>
        <Metric label="Gasto 7 dias" value={money(s.spend_7d, s.currency)} />
        <Metric
          label={s.result_label ? `${s.result_label} 7 dias` : 'Resultados 7 dias'}
          value={s.results_7d != null ? number(s.results_7d, 1) : '—'}
          hint={s.cost_per_result != null ? `${money(s.cost_per_result, s.currency)} cada` : null}
        />
        {detailed && <Metric label="Gasto ontem" value={money(s.spend_yesterday, s.currency)} />}
        {detailed && <Metric label="Gasto hoje" value={money(s.spend_today, s.currency)} />}
        {detailed && <Metric label="Média por dia" value={money(s.avg_daily_spend, s.currency)} />}
        <Metric
          label="Campanhas ativas"
          value={`${number(s.active_campaigns)}${s.active_campaigns_capped ? '+' : ''}`}
          warn={s.active_campaigns > 0 && s.spend_yesterday === 0}
          hint={s.active_campaigns > 0 && s.spend_yesterday === 0 ? 'sem gasto ontem' : null}
        />
        {!detailed && <Metric label="Ontem" value={money(s.spend_yesterday, s.currency)} />}
      </dl>
      {detailed && (
        <p className="mt-3 text-[11px] text-slate-400">
          {s.account_name ? `${s.account_name} · ` : ''}Verificada {timeAgo(s.checked_at)}
          {s.payment_label ? ` · ${s.payment_label}` : ''}
        </p>
      )}
    </div>
  )
}

function Metric({ label, value, hint, warn }) {
  return (
    <div className="min-w-0">
      <dt className="muted truncate first-letter:uppercase">{label}</dt>
      <dd className={cx('tabular font-semibold', warn ? 'text-amber-700 dark:text-amber-300' : 'text-brand-800 dark:text-slate-100')}>
        {value}
        {hint && <span className="muted ml-1 font-normal">{hint}</span>}
      </dd>
    </div>
  )
}
