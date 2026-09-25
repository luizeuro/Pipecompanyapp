// Peças visuais pequenas usadas em várias telas (selos, chips, spinner,
// estado vazio, cabeçalho de página). Centralizadas pra manter o mesmo visual.
import { AlertOctagon, AlertTriangle, Info, Loader2 } from 'lucide-react'
import { LEVEL_STYLES, daysSince, urgencyLevel, optimizationLabel } from '../lib/urgency.js'
import { getTag, TAG_COLOR_CLASSES } from '../lib/tags.js'
import { PLATFORMS, SEVERITY } from '../lib/constants.js'

export function cx(...classes) {
  return classes.filter(Boolean).join(' ')
}

export function Spinner({ className = 'h-4 w-4' }) {
  return <Loader2 className={cx('animate-spin', className)} aria-hidden="true" />
}

export function LevelBadge({ level, children, className }) {
  const style = LEVEL_STYLES[level] || LEVEL_STYLES.never
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset',
        style.badge,
        className,
      )}
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', style.dot)} aria-hidden="true" />
      {children}
    </span>
  )
}

// Selo da régua de otimização (verde/amarelo/vermelho/cinza por dias).
export function OptimizationBadge({ date, prefix = '' }) {
  const level = urgencyLevel(daysSince(date))
  return (
    <LevelBadge level={level}>
      {prefix}
      {optimizationLabel(date)}
    </LevelBadge>
  )
}

export function TagChip({ id, selected, onClick, size = 'sm' }) {
  const tag = getTag(id)
  const base = cx(
    'inline-flex items-center whitespace-nowrap rounded-full font-medium ring-1 ring-inset transition',
    size === 'xs' ? 'px-1.5 py-0 text-[11px]' : 'px-2.5 py-0.5 text-xs',
  )
  if (!onClick) return <span className={cx(base, TAG_COLOR_CLASSES[tag.color])}>{tag.label}</span>
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        base,
        selected
          ? TAG_COLOR_CLASSES[tag.color]
          : 'bg-white text-brand-500 ring-slate-300 hover:ring-slate-400 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-700 dark:hover:ring-slate-500',
      )}
    >
      {tag.label}
    </button>
  )
}

const SEVERITY_ICON = { critical: AlertOctagon, warning: AlertTriangle, info: Info }
const SEVERITY_LEVEL = { critical: 'critical', warning: 'warn', info: 'never' }

export function SeverityIcon({ severity, className = 'h-4 w-4' }) {
  const Icon = SEVERITY_ICON[severity] || Info
  const style = LEVEL_STYLES[SEVERITY_LEVEL[severity]] || LEVEL_STYLES.never
  return <Icon className={cx(className, style.text)} aria-label={SEVERITY[severity]?.label} />
}

export function SeverityBadge({ severity }) {
  return <LevelBadge level={SEVERITY_LEVEL[severity] || 'never'}>{SEVERITY[severity]?.label || severity}</LevelBadge>
}

export function PlatformBadge({ platform }) {
  const colors = {
    meta: 'bg-blue-50 text-blue-700 ring-blue-600/15 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/25',
    google: 'bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-400/25',
  }
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
        colors[platform] || 'bg-slate-100 text-slate-600 ring-slate-500/15 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600/40',
      )}
    >
      {PLATFORMS[platform]?.short || platform}
    </span>
  )
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {Icon && (
        <div className="mb-3 rounded-full bg-brand-100 p-3 text-brand-600 dark:bg-slate-800 dark:text-slate-300">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
      )}
      <p className="font-semibold text-brand-800 dark:text-slate-100">{title}</p>
      {children && <p className="muted mt-1 max-w-sm text-sm">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-brand-800 dark:text-white">{title}</h1>
        {subtitle && <p className="muted mt-1 text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function StatTile({ label, value, hint, level, icon: Icon, onClick, active }) {
  const style = level ? LEVEL_STYLES[level] : null
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cx(
        'card flex min-w-0 flex-col items-start p-4 text-left',
        onClick && 'transition hover:border-brand-300 dark:hover:border-slate-600',
        active && 'border-brand-800 ring-1 ring-brand-800 dark:border-slate-300 dark:ring-slate-300',
      )}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span className="section-title leading-snug">{label}</span>
        {Icon && <Icon className={cx('mt-0.5 h-4 w-4 shrink-0', style ? style.text : 'text-brand-400')} aria-hidden="true" />}
      </div>
      <span className={cx('tabular mt-auto pt-2 text-2xl font-bold', style ? style.text : 'text-brand-800 dark:text-white')}>
        {value}
      </span>
      {hint && <span className="muted mt-0.5 text-xs">{hint}</span>}
    </Comp>
  )
}

export function Field({ label, htmlFor, hint, children, className }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="label">
          {label}
        </label>
      )}
      {children}
      {hint && <p className="muted mt-1 text-xs">{hint}</p>}
    </div>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 dark:bg-slate-800/70" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            'flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition',
            value === t.id
              ? 'bg-white text-brand-800 shadow-sm dark:bg-slate-950 dark:text-white'
              : 'text-brand-500 hover:text-brand-800 dark:text-slate-400 dark:hover:text-slate-100',
          )}
        >
          {t.label}
          {t.count != null && (
            <span className="rounded-full bg-slate-200 px-1.5 text-[11px] tabular dark:bg-slate-700">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}
