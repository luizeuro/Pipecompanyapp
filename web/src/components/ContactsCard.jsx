// Contatos do cliente (quem decide, quem aprova, financeiro...), com atalho
// pra abrir o WhatsApp e o e-mail direto do cartão.
import { useEffect, useState } from 'react'
import { Crown, Mail, MessageCircle, Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api.js'
import { whatsappHref } from '../lib/format.js'
import ConfirmDialog from './ConfirmDialog.jsx'
import Modal from './Modal.jsx'
import { Field, Spinner } from './ui.jsx'
import { useToast } from './Toast.jsx'

function ContactForm({ open, contact, clientId, onClose, onSaved }) {
  const [form, setForm] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const toast = useToast()

  useEffect(() => {
    if (!open) return
    setError(null)
    setForm(
      contact
        ? { name: contact.name, role: contact.role || '', phone: contact.phone || '', email: contact.email || '', is_decision_maker: contact.is_decision_maker, notes: contact.notes || '' }
        : { name: '', role: '', phone: '', email: '', is_decision_maker: false, notes: '' },
    )
  }, [open, contact])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api(contact ? `/contacts/${contact.id}` : '/contacts', {
        method: contact ? 'PATCH' : 'POST',
        body: contact ? form : { ...form, client_id: clientId },
      })
      toast(contact ? 'Contato atualizado' : 'Contato adicionado')
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
      title={contact ? 'Editar contato' : 'Novo contato'}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" form="contact-form" className="btn-primary" disabled={busy}>
            {busy && <Spinner />}
            Salvar
          </button>
        </>
      }
    >
      <form id="contact-form" onSubmit={submit} className="space-y-3">
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
        <Field label="Nome" htmlFor="ct-name">
          <input id="ct-name" className="input" value={form.name || ''} onChange={set('name')} required maxLength={120} />
        </Field>
        <Field label="Cargo / papel" htmlFor="ct-role">
          <input id="ct-role" className="input" value={form.role || ''} onChange={set('role')} maxLength={80} placeholder="Ex: sócio, marketing, financeiro" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="WhatsApp / telefone" htmlFor="ct-phone">
            <input id="ct-phone" className="input" inputMode="tel" value={form.phone || ''} onChange={set('phone')} maxLength={40} placeholder="(13) 99999-0000" />
          </Field>
          <Field label="E-mail" htmlFor="ct-email">
            <input id="ct-email" type="email" className="input" value={form.email || ''} onChange={set('email')} maxLength={160} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={Boolean(form.is_decision_maker)} onChange={set('is_decision_maker')} className="h-4 w-4 rounded border-slate-300" />
          É quem decide (aprova verba e contrato)
        </label>
        <Field label="Observações" htmlFor="ct-notes">
          <input id="ct-notes" className="input" value={form.notes || ''} onChange={set('notes')} maxLength={1000} placeholder="Ex: prefere áudio, só responde à tarde" />
        </Field>
      </form>
    </Modal>
  )
}

export default function ContactsCard({ clientId, contacts, onChanged }) {
  const toast = useToast()
  const [editing, setEditing] = useState(null) // null fechado, {} novo, contato = editar
  const [deleting, setDeleting] = useState(null)

  async function remove() {
    try {
      await api(`/contacts/${deleting.id}`, { method: 'DELETE' })
      toast('Contato excluído')
      await onChanged?.()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <section className="card">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h2 className="section-title">Contatos</h2>
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing({})}>
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </button>
      </div>
      {contacts.length === 0 ? (
        <p className="muted px-4 py-4 text-sm">Nenhum contato cadastrado. Comece por quem decide.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {[...contacts]
            .sort((a, b) => Number(b.is_decision_maker) - Number(a.is_decision_maker))
            .map((ct) => {
              const wa = whatsappHref(ct.phone)
              return (
                <li key={ct.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      {ct.name}
                      {ct.is_decision_maker && (
                        <span title="Decide" className="text-amber-500">
                          <Crown className="h-3.5 w-3.5" aria-label="Decide" />
                        </span>
                      )}
                    </p>
                    <p className="muted text-xs">{[ct.role, ct.phone, ct.email].filter(Boolean).join(' · ') || '—'}</p>
                    {ct.notes && <p className="mt-0.5 text-xs text-slate-400">{ct.notes}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {wa && (
                      <a className="icon-btn hover:text-emerald-600" href={wa} target="_blank" rel="noreferrer" title="Abrir WhatsApp" aria-label={`WhatsApp de ${ct.name}`}>
                        <MessageCircle className="h-4 w-4" />
                      </a>
                    )}
                    {ct.email && (
                      <a className="icon-btn" href={`mailto:${ct.email}`} title="Enviar e-mail" aria-label={`E-mail de ${ct.name}`}>
                        <Mail className="h-4 w-4" />
                      </a>
                    )}
                    <button type="button" className="icon-btn" onClick={() => setEditing(ct)} aria-label={`Editar ${ct.name}`}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" className="icon-btn hover:text-rose-600" onClick={() => setDeleting(ct)} aria-label={`Excluir ${ct.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              )
            })}
        </ul>
      )}
      <ContactForm
        open={editing !== null}
        contact={editing?.id ? editing : null}
        clientId={clientId}
        onClose={() => setEditing(null)}
        onSaved={onChanged}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Excluir contato"
        message={`Excluir ${deleting?.name} dos contatos deste cliente?`}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </section>
  )
}
