// Registrar/editar otimização (modal). Salvar recalcula a "última otimização"
// do cliente no backend, então a régua de cores atualiza sozinha.
import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { OPTIMIZATION_CATEGORIES, PLATFORMS } from '../lib/constants.js'
import { todayInput, toDateInput } from '../lib/format.js'
import { useData } from '../lib/data.jsx'
import Modal from './Modal.jsx'
import { Field, Spinner } from './ui.jsx'
import { useToast } from './Toast.jsx'

function defaultPlatform(client) {
  if (!client) return 'meta'
  if (client.meta_ad_account_id && client.google_ads_customer_id) return 'meta'
  return client.google_ads_customer_id ? 'google' : 'meta'
}

export default function OptimizationForm({ open, optimization, clientId, onClose, onSaved }) {
  const { clients, clientsById } = useData()
  const [form, setForm] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const toast = useToast()
  const editing = Boolean(optimization)

  useEffect(() => {
    if (!open) return
    setError(null)
    if (optimization) {
      setForm({
        client_id: optimization.client_id,
        platform: optimization.platform,
        category: optimization.category,
        description: optimization.description,
        performed_at: toDateInput(optimization.performed_at),
      })
    } else {
      setForm({
        client_id: clientId || '',
        platform: defaultPlatform(clientsById.get(clientId)),
        category: 'criativos',
        description: '',
        performed_at: todayInput(),
      })
    }
  }, [open, optimization, clientId, clientsById])

  const set = (key) => (e) => {
    const value = e.target.value
    setForm((f) => ({
      ...f,
      [key]: value,
      ...(key === 'client_id' && !editing ? { platform: defaultPlatform(clientsById.get(value)) } : {}),
    }))
  }

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api(editing ? `/optimizations/${optimization.id}` : '/optimizations', {
        method: editing ? 'PATCH' : 'POST',
        body: form,
      })
      toast(editing ? 'Otimização atualizada' : 'Otimização registrada')
      await onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const activeClients = clients.filter((c) => c.status === 'active' || c.id === form.client_id)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar otimização' : 'Registrar otimização'}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" form="opt-form" className="btn-primary" disabled={busy}>
            {busy && <Spinner />}
            Salvar
          </button>
        </>
      }
    >
      <form id="opt-form" onSubmit={submit} className="space-y-4">
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
        <Field label="Cliente" htmlFor="of-client">
          <select id="of-client" className="input" value={form.client_id || ''} onChange={set('client_id')} required>
            <option value="" disabled>
              Escolha o cliente…
            </option>
            {activeClients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Plataforma" htmlFor="of-platform">
            <select id="of-platform" className="input" value={form.platform || 'meta'} onChange={set('platform')}>
              {Object.entries(PLATFORMS).map(([id, p]) => (
                <option key={id} value={id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tipo" htmlFor="of-category">
            <select id="of-category" className="input" value={form.category || 'outro'} onChange={set('category')}>
              {OPTIMIZATION_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data" htmlFor="of-date">
            <input id="of-date" type="date" className="input" value={form.performed_at || ''} max={todayInput()} onChange={set('performed_at')} required />
          </Field>
        </div>
        <Field label="O que foi feito" htmlFor="of-desc">
          <textarea
            id="of-desc"
            className="input min-h-[110px]"
            value={form.description || ''}
            onChange={set('description')}
            required
            maxLength={4000}
            placeholder="Ex: pausei os 2 criativos com CPL acima de R$ 30 e subi 3 variações do vídeo de depoimento."
          />
        </Field>
      </form>
    </Modal>
  )
}
