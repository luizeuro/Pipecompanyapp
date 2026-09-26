// Cartão de cliente do Painel: tudo que importa no dia a dia numa olhada
// (saldo por plataforma, régua de otimização, pendências e alertas).
import { Link } from 'react-router-dom'
import { BellRing, ListTodo, Plus, UserRound } from 'lucide-react'
import { CLIENT_STATUS } from '../lib/constants.js'
import PlatformBlock from './PlatformBlock.jsx'
import { cx, HealthBadge, LastContactBadge, LevelBadge, OptimizationBadge, TagChip } from './ui.jsx'

export default function ClientCard({ client: c, onAddOptimization }) {
  const platforms = [
    c.meta_ad_account_id && ['meta', c.meta_snapshot, c.meta_level],
    c.google_ads_customer_id && ['google', c.google_snapshot, c.google_level],
  ].filter(Boolean)
  const inactive = c.status !== 'active'

  return (
    <article className={cx('card flex flex-col p-4', inactive && 'opacity-70')}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/clientes/${c.id}`} className="block truncate text-base font-bold text-brand-800 hover:underline dark:text-white">
            {c.name}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {inactive && <LevelBadge level="never">{CLIENT_STATUS[c.status]?.label}</LevelBadge>}
            <HealthBadge health={c.health} />
            {(c.tags || []).map((t) => (
              <TagChip key={t} id={t} size="xs" />
            ))}
            {c.manager && (
              <span className="muted inline-flex items-center gap-1 text-[11px]">
                <UserRound className="h-3 w-3" aria-hidden="true" />
                {c.manager}
              </span>
            )}
          </div>
        </div>
        {c.open_alerts_count > 0 && (
          <Link
            to={`/clientes/${c.id}`}
            className={cx(
              'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-bold',
              c.critical_alerts_count > 0
                ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
            )}
            title={`${c.open_alerts_count} alerta(s) aberto(s)`}
          >
            <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
            {c.open_alerts_count}
          </Link>
        )}
      </header>

      {platforms.length ? (
        <div className={cx('grid gap-2', platforms.length === 2 && 'sm:grid-cols-2')}>
          {platforms.map(([p, s, level]) => (
            <PlatformBlock key={p} platform={p} snapshot={s} level={level} />
          ))}
        </div>
      ) : (
        <p className="muted rounded-lg border border-dashed border-slate-300 p-3 text-sm dark:border-slate-700">
          Nenhuma conta de anúncio vinculada.{' '}
          <Link to={`/clientes/${c.id}`} className="font-semibold underline">
            Vincular
          </Link>
        </p>
      )}

      <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <OptimizationBadge date={c.last_optimization_at} prefix="Otimização: " />
          <LastContactBadge date={c.last_contact_at} />
          {c.open_pendencias_count > 0 && (
            <Link
              to={`/clientes/${c.id}?aba=pendencias`}
              className={cx(
                'inline-flex items-center gap-1 text-xs font-semibold hover:underline',
                c.overdue_pendencias_count > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-brand-600 dark:text-slate-300',
              )}
            >
              <ListTodo className="h-3.5 w-3.5" aria-hidden="true" />
              {c.open_pendencias_count} pendência{c.open_pendencias_count > 1 ? 's' : ''}
              {c.overdue_pendencias_count > 0 && ` (${c.overdue_pendencias_count} atrasada${c.overdue_pendencias_count > 1 ? 's' : ''})`}
            </Link>
          )}
        </div>
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => onAddOptimization(c)}>
          <Plus className="h-3.5 w-3.5" /> Otimização
        </button>
      </footer>
    </article>
  )
}
