// Registrar contato com cliente ou lead (reunião, ligação, WhatsApp...).
// O "próximo passo" com data vira follow-up na tela Hoje até ser concluído.
import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { INTERACTION_KINDS } from '../lib/constants.js'
import { todayInput, toDateInput } from '../lib/format.js'
import Modal from './Modal.jsx'
import { KIND_ICONS } from './kindIcons.js'
import { cx, Field, Spinner } from './ui.jsx'
import { useToast } from './Toast.jsx'

export default function InteractionForm({ open, onClose, onSaved, clientId, leadId, interaction, targetName }) {
  const [form, setForm] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const toast = useToast()
  const editing = Boolean(interaction)

  useEffect(() => {
    if (!open) return
    setError(null)
    setForm(
      interaction
        ? {
            kind: interaction.kind,
            summary: interaction.summary,
            happened_at: toDateInput(interaction.happened_at),
            next_step: interaction.next_step || '',
            next_step_at: interaction.next_step_at || '',
            next_step_done: interaction.next_step_done,
          }
        : { kind: 'whatsapp', summary: '', happened_at: todayInput(), next_step: '', next_step_at: '' },
    )
  }, [open, interaction])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function submit(e) {
    e.preventDefault()
    if (form.next_step && !form.next_step_at) {
      setError('Dê uma data para o próximo passo, pra ele aparecer na tela Hoje.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const body = { ...form }
      if (!editing) Object.assign(body, clientId ? { client_id: clientId } : { lead_id: leadId })
      await api(editing ? `/interactions/${interaction.id}` : '/interactions', { method: editing ? 'PATCH' : 'POST', body })
      toast(editing ? 'Registro atualizado' : 'Contato registrado')
      await onSaved?.()
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
      title={editing ? 'Editar registro' : `Registrar contato${targetName ? ` · ${targetName}` : ''}`}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" form="interaction-form" className="btn-primary" disabled={busy}>
            {busy && <Spinner />}
            Salvar
          </button>
        </>
      }
    >
      <form id="interaction-form" onSubmit={submit} className="space-y-4">
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
        <Field label="Tipo">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo de registro">
            {INTERACTION_KINDS.map((k) => {
              const Icon = KIND_ICONS[k.id]
              const selected = form.kind === k.id
              return (
                <button
                  key={k.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setForm((f) => ({ ...f, kind: k.id }))}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition',
                    selected
                      ? 'border-brand-800 bg-brand-800 text-white dark:border-white dark:bg-white dark:text-brand-800'
                      : 'border-slate-300 text-brand-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {k.label}
                </button>
              )
            })}
          </div>
          {form.kind === 'note' && <p className="muted mt-1 text-xs">Nota interna não conta como contato com o cliente.</p>}
        </Field>
        <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
          <Field label="O que aconteceu" htmlFor="if-summary">
            <textarea
              id="if-summary"
              className="input min-h-[96px]"
              value={form.summary || ''}
              onChange={set('summary')}
              required
              maxLength={4000}
              placeholder="Ex: reunião mensal, cliente pediu foco em vendas de outubro."
            />
          </Field>
          <Field label="Data" htmlFor="if-date">
            <input id="if-date" type="date" className="input" value={form.happened_at || ''} max={todayInput()} onChange={set('happened_at')} required />
          </Field>
        </div>
        <div className="grid gap-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-950/50 sm:grid-cols-[1fr_160px]">
          <Field label="Próximo passo (opcional)" htmlFor="if-next">
            <input id="if-next" className="input" value={form.next_step || ''} onChange={set('next_step')} maxLength={200} placeholder="Ex: enviar relatório de outubro" />
          </Field>
          <Field label="Até quando" htmlFor="if-next-at">
            <input id="if-next-at" type="date" className="input" value={form.next_step_at || ''} onChange={set('next_step_at')} />
          </Field>
          {editing && form.next_step && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={Boolean(form.next_step_done)} onChange={set('next_step_done')} className="h-4 w-4 rounded border-slate-300" />
              Próximo passo concluído
            </label>
          )}
        </div>
      </form>
    </Modal>
  )
}
