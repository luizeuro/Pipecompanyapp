// Ficha comercial do cliente: contrato (honorário, verba, datas), links úteis
// e onde estão os acessos. Só leitura; editar abre o formulário do cliente.
import { ExternalLink, KeyRound, Pencil } from 'lucide-react'
import { LINK_FIELDS } from '../lib/constants.js'
import { dateBR, daysUntil, linkHref, money, relativeDay } from '../lib/format.js'
import { cx } from './ui.jsx'

function Item({ label, children, tone }) {
  return (
    <div className="min-w-0">
      <dt className="muted text-[11px] font-semibold uppercase tracking-wide">{label}</dt>
      <dd className={cx('tabular mt-0.5 text-sm font-semibold', tone || 'text-brand-800 dark:text-slate-100')}>{children}</dd>
    </div>
  )
}

export default function ContractCard({ client: c, onEdit }) {
  const renewalIn = daysUntil(c.renewal_date)
  const renewalTone =
    renewalIn == null ? null : renewalIn < 0 ? 'text-rose-700 dark:text-rose-300' : renewalIn <= 30 ? 'text-amber-700 dark:text-amber-300' : null
  const links = LINK_FIELDS.filter((f) => c.links?.[f.key])

  return (
    <section className="card">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h2 className="section-title">Contrato e ficha</h2>
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" /> Editar
        </button>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 sm:grid-cols-3">
        <Item label="Honorário mensal">{c.fee_monthly != null ? money(c.fee_monthly) : '—'}</Item>
        <Item label="Verba de mídia">{c.monthly_budget != null ? money(c.monthly_budget) : '—'}</Item>
        <Item label="Cobrança">{c.billing_day ? `Todo dia ${c.billing_day}` : '—'}</Item>
        <Item label="Cliente desde">{c.contract_start ? dateBR(c.contract_start) : '—'}</Item>
        <Item label="Renovação" tone={renewalTone}>
          {c.renewal_date ? `${dateBR(c.renewal_date)} (${relativeDay(c.renewal_date)})` : '—'}
        </Item>
        <Item label="Segmento / cidade">{[c.segment, c.city].filter(Boolean).join(' · ') || '—'}</Item>
      </dl>
      {(links.length > 0 || c.access_notes) && (
        <div className="space-y-3 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
          {links.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {links.map((f) => (
                <a
                  key={f.key}
                  href={linkHref(f.key, c.links[f.key])}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-brand-600 transition hover:border-brand-400 hover:text-brand-800 dark:border-slate-700 dark:text-slate-300 dark:hover:text-white"
                >
                  {f.label}
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              ))}
            </div>
          )}
          {c.access_notes && (
            <p className="flex items-start gap-1.5 text-xs text-brand-600 dark:text-slate-300">
              <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="whitespace-pre-line">{c.access_notes}</span>
            </p>
          )}
        </div>
      )}
    </section>
  )
}
