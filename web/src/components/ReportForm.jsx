// Publicar relatório/análise pela equipe (o agente publica pela ferramenta MCP).
import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { REPORT_KINDS } from '../lib/constants.js'
import { useData } from '../lib/data.jsx'
import Markdown from './Markdown.jsx'
import Modal from './Modal.jsx'
import { Field, Spinner, Tabs } from './ui.jsx'
import { useToast } from './Toast.jsx'

export default function ReportForm({ open, clientId, onClose, onSaved }) {
  const { clients } = useData()
  const [form, setForm] = useState({})
  const [view, setView] = useState('write')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const toast = useToast()

  useEffect(() => {
    if (!open) return
    setError(null)
    setView('write')
    setForm({ client_id: clientId || '', kind: 'report', title: '', content: '', period_start: '', period_end: '' })
  }, [open, clientId])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/reports', { method: 'POST', body: { ...form, client_id: form.client_id || null } })
      toast('Relatório publicado')
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
      title="Novo relatório"
      size="lg"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" form="report-form" className="btn-primary" disabled={busy}>
            {busy && <Spinner />}
            Publicar
          </button>
        </>
      }
    >
      <form id="report-form" onSubmit={submit} className="space-y-4">
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Cliente" htmlFor="rf-client" className="sm:col-span-2">
            <select id="rf-client" className="input" value={form.client_id || ''} onChange={set('client_id')}>
              <option value="">Agência (geral)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tipo" htmlFor="rf-kind">
            <select id="rf-kind" className="input" value={form.kind || 'report'} onChange={set('kind')}>
              {REPORT_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Título" htmlFor="rf-title" className="sm:col-span-3">
            <input id="rf-title" className="input" value={form.title || ''} onChange={set('title')} required maxLength={200} placeholder="Ex: Relatório de setembro" />
          </Field>
          <Field label="Período (início)" htmlFor="rf-start">
            <input id="rf-start" type="date" className="input" value={form.period_start || ''} onChange={set('period_start')} />
          </Field>
          <Field label="Período (fim)" htmlFor="rf-end">
            <input id="rf-end" type="date" className="input" value={form.period_end || ''} onChange={set('period_end')} />
          </Field>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="label mb-0">Conteúdo (Markdown)</span>
            <Tabs
              value={view}
              onChange={setView}
              tabs={[
                { id: 'write', label: 'Escrever' },
                { id: 'preview', label: 'Pré-visualizar' },
              ]}
            />
          </div>
          {view === 'write' ? (
            <textarea
              className="input min-h-[220px] font-mono text-xs"
              value={form.content || ''}
              onChange={set('content')}
              required
              placeholder={'## Resumo\n- 63 conversas, R$ 13,33 cada\n\n## Próximos passos\n- ...'}
            />
          ) : (
            <div className="min-h-[220px] rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <Markdown text={form.content || '_Nada escrito ainda._'} />
            </div>
          )}
        </div>
      </form>
    </Modal>
  )
}
