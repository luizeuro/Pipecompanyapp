// Criar/editar lead do funil comercial.
import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { LEAD_SOURCES, LEAD_STAGES, OPEN_STAGES } from '../lib/constants.js'
import { useData } from '../lib/data.jsx'
import Modal from './Modal.jsx'
import { Field, Spinner } from './ui.jsx'
import { useToast } from './Toast.jsx'

const EMPTY = {
  company: '',
  contact_name: '',
  contact_phone: '',
  contact_email: '',
  instagram: '',
  segment: '',
  source: '',
  stage: 'lead',
  fee_proposed: '',
  media_budget: '',
  proposal_url: '',
  next_step: '',
  next_step_at: '',
  owner: '',
  notes: '',
}

export default function LeadForm({ open, lead, defaultStage = 'lead', onClose, onSaved }) {
  const { users } = useData()
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const toast = useToast()
  const editing = Boolean(lead)

  useEffect(() => {
    if (!open) return
    setError(null)
    if (lead) {
      const f = { ...EMPTY }
      for (const key of Object.keys(EMPTY)) f[key] = lead[key] != null ? String(lead[key]) : ''
      setForm(f)
    } else {
      setForm({ ...EMPTY, stage: defaultStage })
    }
  }, [open, lead, defaultStage])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const body = { ...form }
      // Etapa de lead fechado/perdido muda pelas ações próprias, não pelo formulário.
      if (editing && !OPEN_STAGES.includes(lead.stage)) delete body.stage
      const { lead: saved } = await api(editing ? `/leads/${lead.id}` : '/leads', { method: editing ? 'PATCH' : 'POST', body })
      toast(editing ? 'Lead atualizado' : 'Lead criado')
      await onSaved?.(saved)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Editar ${lead.company}` : 'Novo lead'}
      size="lg"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" form="lead-form" className="btn-primary" disabled={busy}>
            {busy && <Spinner />}
            {editing ? 'Salvar' : 'Criar lead'}
          </button>
        </>
      }
    >
      <form id="lead-form" onSubmit={submit} className="space-y-4">
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Empresa" htmlFor="lf-company" className="sm:col-span-2">
            <input id="lf-company" className="input" value={form.company} onChange={set('company')} required maxLength={120} />
          </Field>
          <Field label="Etapa" htmlFor="lf-stage">
            <select
              id="lf-stage"
              className="input"
              value={form.stage}
              onChange={set('stage')}
              disabled={editing && !OPEN_STAGES.includes(lead.stage)}
            >
              {LEAD_STAGES.filter((s) => OPEN_STAGES.includes(s.id) || s.id === form.stage).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Contato" htmlFor="lf-contact">
            <input id="lf-contact" className="input" value={form.contact_name} onChange={set('contact_name')} maxLength={120} />
          </Field>
          <Field label="WhatsApp / telefone" htmlFor="lf-phone">
            <input id="lf-phone" className="input" inputMode="tel" value={form.contact_phone} onChange={set('contact_phone')} maxLength={40} />
          </Field>
          <Field label="E-mail" htmlFor="lf-email">
            <input id="lf-email" type="email" className="input" value={form.contact_email} onChange={set('contact_email')} maxLength={160} />
          </Field>
          <Field label="Instagram" htmlFor="lf-ig">
            <input id="lf-ig" className="input" value={form.instagram} onChange={set('instagram')} maxLength={120} placeholder="@perfil" />
          </Field>
          <Field label="Segmento" htmlFor="lf-segment">
            <input id="lf-segment" className="input" value={form.segment} onChange={set('segment')} maxLength={80} />
          </Field>
          <Field label="Origem" htmlFor="lf-source">
            <select id="lf-source" className="input" value={form.source} onChange={set('source')}>
              <option value="">—</option>
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <fieldset className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <legend className="section-title px-1">Proposta</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Honorário proposto (R$/mês)" htmlFor="lf-fee">
              <input id="lf-fee" className="input" inputMode="decimal" value={form.fee_proposed} onChange={set('fee_proposed')} />
            </Field>
            <Field label="Verba de mídia (R$/mês)" htmlFor="lf-budget">
              <input id="lf-budget" className="input" inputMode="decimal" value={form.media_budget} onChange={set('media_budget')} />
            </Field>
            <Field label="Responsável" htmlFor="lf-owner">
              <input id="lf-owner" className="input" value={form.owner} onChange={set('owner')} list="lf-team" maxLength={80} />
              <datalist id="lf-team">
                {users.map((u) => (
                  <option key={u.id} value={u.name} />
                ))}
              </datalist>
            </Field>
            <Field label="Link da proposta (deck)" htmlFor="lf-url" className="sm:col-span-3">
              <input id="lf-url" className="input" value={form.proposal_url} onChange={set('proposal_url')} maxLength={500} placeholder="https://…" />
            </Field>
          </div>
        </fieldset>

        <div className="grid gap-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-950/50 sm:grid-cols-[1fr_160px]">
          <Field label="Próximo passo" htmlFor="lf-next">
            <input id="lf-next" className="input" value={form.next_step} onChange={set('next_step')} maxLength={200} placeholder="Ex: cobrar retorno da proposta" />
          </Field>
          <Field label="Quando" htmlFor="lf-next-at">
            <input id="lf-next-at" type="date" className="input" value={form.next_step_at} onChange={set('next_step_at')} />
          </Field>
        </div>

        <Field label="Observações" htmlFor="lf-notes">
          <textarea id="lf-notes" className="input min-h-[70px]" value={form.notes} onChange={set('notes')} maxLength={4000} />
        </Field>
      </form>
    </Modal>
  )
}
