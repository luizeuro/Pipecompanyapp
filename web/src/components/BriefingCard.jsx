// Briefing do cliente: serviços contratados, regras obrigatórias (em
// destaque, antes de tudo), metas, cadência e o contexto do negócio. É o que
// alguém recém-chegado na equipe lê antes de mexer na conta ou escrever copy.
import { useState } from 'react'
import { AlertTriangle, CalendarClock, Pencil, Target } from 'lucide-react'
import { api } from '../lib/api.js'
import { BRIEFING_FIELDS, SERVICES, WEEKDAYS } from '../lib/constants.js'
import { money } from '../lib/format.js'
import Modal from './Modal.jsx'
import { useToast } from './Toast.jsx'
import { cx, Field, Spinner } from './ui.jsx'

export function ServiceChips({ services, short = true, empty = null }) {
  if (!services?.length) return empty
  return (
    <span className="inline-flex flex-wrap gap-1">
      {SERVICES.filter((s) => services.includes(s.id)).map((s) => (
        <span key={s.id} className="chip">
          {short ? s.short : s.label}
        </span>
      ))}
    </span>
  )
}

function BriefingForm({ client, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState(() => ({
    services: client.services || [],
    briefing: { ...(client.briefing || {}) },
    target_cpr: client.target_cpr ?? '',
    optimization_weekday: client.optimization_weekday ?? '',
    report_day: client.report_day ?? '',
  }))
  const [saving, setSaving] = useState(false)
  const setB = (key, value) => setForm((f) => ({ ...f, briefing: { ...f.briefing, [key]: value } }))
  const toggleService = (id) =>
    setForm((f) => ({ ...f, services: f.services.includes(id) ? f.services.filter((s) => s !== id) : [...f.services, id] }))

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await api(`/clients/${client.id}`, {
        method: 'PATCH',
        body: {
          services: form.services,
          briefing: form.briefing,
          target_cpr: form.target_cpr === '' ? null : form.target_cpr,
          optimization_weekday: form.optimization_weekday === '' ? null : Number(form.optimization_weekday),
          report_day: form.report_day === '' ? null : Number(form.report_day),
        },
      })
      toast('Briefing salvo.')
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Briefing · ${client.name}`}
      size="lg"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="briefing-form" className="btn-primary" disabled={saving}>
            {saving && <Spinner />} Salvar briefing
          </button>
        </>
      }
    >
      <form id="briefing-form" onSubmit={save} className="space-y-5">
        <div>
          <span className="label">Serviços contratados</span>
          <div className="flex flex-wrap gap-2">
            {SERVICES.map((s) => {
              const on = form.services.includes(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleService(s.id)}
                  aria-pressed={on}
                  className={cx(
                    'rounded-lg border px-3 py-1.5 text-sm font-medium transition',
                    on
                      ? 'border-accent-500 bg-accent-50 text-accent-700 dark:border-accent-400/60 dark:bg-accent-500/15 dark:text-accent-200'
                      : 'border-slate-300 text-brand-500 hover:border-slate-400 dark:border-white/10 dark:text-slate-400 dark:hover:border-white/20',
                  )}
                >
                  {s.label}
                </button>
              )
            })}
          </div>
          <p className="muted mt-1.5 text-xs">Define o checklist de onboarding e as oportunidades de expansão em Números.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Meta de custo por resultado (R$)" htmlFor="bf-target" hint="Campanha acima disso vira recomendação.">
            <input
              id="bf-target"
              className="input"
              inputMode="decimal"
              value={form.target_cpr}
              onChange={(e) => setForm((f) => ({ ...f, target_cpr: e.target.value }))}
              placeholder="Ex.: 12,00"
            />
          </Field>
          <Field label="Otimização semanal" htmlFor="bf-weekday" hint="Entra na agenda do Hoje.">
            <select
              id="bf-weekday"
              className="input"
              value={form.optimization_weekday}
              onChange={(e) => setForm((f) => ({ ...f, optimization_weekday: e.target.value }))}
            >
              <option value="">Sem dia fixo</option>
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Relatório mensal até o dia" htmlFor="bf-report" hint="1 a 28. Entra na agenda.">
            <input
              id="bf-report"
              className="input"
              type="number"
              min="1"
              max="28"
              value={form.report_day}
              onChange={(e) => setForm((f) => ({ ...f, report_day: e.target.value }))}
              placeholder="Ex.: 5"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {BRIEFING_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} htmlFor={`bf-${f.key}`} className={f.key === 'regras' ? 'sm:col-span-2' : undefined}>
              <textarea
                id={`bf-${f.key}`}
                className={cx('input', f.key === 'regras' && 'border-amber-400/60 dark:border-amber-400/30')}
                rows={f.rows}
                value={form.briefing[f.key] || ''}
                onChange={(e) => setB(f.key, e.target.value)}
                placeholder={f.placeholder}
              />
            </Field>
          ))}
        </div>
      </form>
    </Modal>
  )
}

export default function BriefingCard({ client: c, onChanged }) {
  const [editing, setEditing] = useState(false)
  const b = c.briefing || {}
  const filled = BRIEFING_FIELDS.filter((f) => f.key !== 'regras' && b[f.key])
  const cadence = [
    c.optimization_weekday != null && `Otimização toda ${WEEKDAYS[c.optimization_weekday].toLowerCase()}`,
    c.report_day && `Relatório até o dia ${c.report_day}`,
  ].filter(Boolean)

  return (
    <section className="card">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/[0.06]">
        <h2 className="section-title">Briefing</h2>
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing(true)}>
          <Pencil className="h-3.5 w-3.5" /> Editar
        </button>
      </div>

      {b.regras && (
        <div className="mx-4 mt-4 flex gap-2.5 rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/[0.07] dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />
          <div>
            <div className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
              Regras do cliente
            </div>
            <p className="mt-0.5 whitespace-pre-line">{b.regras}</p>
          </div>
        </div>
      )}

      <div className="space-y-3 px-4 py-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <ServiceChips services={c.services} short={false} empty={<span className="muted">Nenhum serviço marcado</span>} />
        </div>
        {(c.target_cpr != null || cadence.length > 0) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-600 dark:text-slate-300">
            {c.target_cpr != null && (
              <span className="inline-flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5 text-accent-500 dark:text-accent-300" /> Meta: {money(c.target_cpr)} por resultado
              </span>
            )}
            {cadence.map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5 text-accent-500 dark:text-accent-300" /> {t}
              </span>
            ))}
          </div>
        )}
        {filled.length > 0 ? (
          <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            {filled.map((f) => (
              <div key={f.key} className="min-w-0">
                <dt className="eyebrow">{f.label}</dt>
                <dd className="mt-0.5 whitespace-pre-line text-sm text-brand-700 dark:text-slate-200">{b[f.key]}</dd>
              </div>
            ))}
          </dl>
        ) : (
          !b.regras && (
            <button type="button" onClick={() => setEditing(true)} className="muted text-left text-sm hover:text-accent-600 dark:hover:text-accent-300">
              Sem briefing ainda. Preencha objetivo, oferta, público e regras: é o que a equipe lê antes de mexer na conta.
            </button>
          )
        )}
      </div>

      {editing && (
        <BriefingForm
          client={c}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            onChanged()
          }}
        />
      )}
    </section>
  )
}
