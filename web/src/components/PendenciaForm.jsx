// Criar/editar pendência (modal).
import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { useData } from '../lib/data.jsx'
import Modal from './Modal.jsx'
import { Field, Spinner } from './ui.jsx'
import { useToast } from './Toast.jsx'

export default function PendenciaForm({ open, pendencia, clientId, onClose, onSaved }) {
  const { clients, users } = useData()
  const [form, setForm] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const toast = useToast()
  const editing = Boolean(pendencia)

  useEffect(() => {
    if (!open) return
    setError(null)
    setForm(
      pendencia
        ? {
            client_id: pendencia.client_id,
            title: pendencia.title,
            description: pendencia.description || '',
            due_date: pendencia.due_date || '',
            assignee: pendencia.assignee || '',
          }
        : { client_id: clientId || '', title: '', description: '', due_date: '', assignee: '' },
    )
  }, [open, pendencia, clientId])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api(editing ? `/pendencias/${pendencia.id}` : '/pendencias', {
        method: editing ? 'PATCH' : 'POST',
        body: form,
      })
      toast(editing ? 'Pendência atualizada' : 'Pendência criada')
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
      title={editing ? 'Editar pendência' : 'Nova pendência'}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" form="pend-form" className="btn-primary" disabled={busy}>
            {busy && <Spinner />}
            Salvar
          </button>
        </>
      }
    >
      <form id="pend-form" onSubmit={submit} className="space-y-4">
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
        <Field label="Cliente" htmlFor="pf-client">
          <select id="pf-client" className="input" value={form.client_id || ''} onChange={set('client_id')} required>
            <option value="" disabled>
              Escolha o cliente…
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Pendência" htmlFor="pf-title">
          <input id="pf-title" className="input" value={form.title || ''} onChange={set('title')} required maxLength={200} placeholder="Ex: pedir acesso ao GTM do site" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prazo" htmlFor="pf-due" hint="Opcional. Passou do prazo, fica vermelho.">
            <input id="pf-due" type="date" className="input" value={form.due_date || ''} onChange={set('due_date')} />
          </Field>
          <Field label="Responsável" htmlFor="pf-assignee">
            <input id="pf-assignee" className="input" value={form.assignee || ''} onChange={set('assignee')} list="pf-team" maxLength={80} />
            <datalist id="pf-team">
              {users.map((u) => (
                <option key={u.id} value={u.name} />
              ))}
            </datalist>
          </Field>
        </div>
        <Field label="Detalhes" htmlFor="pf-desc">
          <textarea id="pf-desc" className="input min-h-[80px]" value={form.description || ''} onChange={set('description')} maxLength={4000} />
        </Field>
      </form>
    </Modal>
  )
}
