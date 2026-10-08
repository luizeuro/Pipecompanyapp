// "Mensagem" na ficha do cliente: escolhe o modelo, revisa o texto, abre o
// WhatsApp do contato já com a mensagem e (opcional) registra o contato na
// linha do tempo — o que alimenta a saúde do cliente.
import { useMemo, useState } from 'react'
import { Copy, MessageCircle } from 'lucide-react'
import { api } from '../lib/api.js'
import { MESSAGE_TEMPLATES } from '../lib/messages.js'
import { whatsappHref } from '../lib/format.js'
import Modal from './Modal.jsx'
import { useToast } from './Toast.jsx'
import { cx, Field } from './ui.jsx'

// "Dra. Paula Souza" → "Paula": o título fica de fora da saudação.
const TITLES = /^(dr|dra|sr|sra|srta|prof|profa)\.?$/i
function firstNameOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  return parts.find((p) => !TITLES.test(p)) || 'tudo bem'
}

export default function MessageModal({ client, contacts, initialTemplate = 'recarga', onClose, onSent }) {
  const toast = useToast()
  const withPhone = useMemo(() => contacts.filter((c) => whatsappHref(c.phone)), [contacts])
  const [contactId, setContactId] = useState(() => (withPhone.find((c) => c.is_decision_maker) || withPhone[0])?.id || '')
  const contact = withPhone.find((c) => c.id === contactId) || null
  const firstName = firstNameOf(contact?.name)
  const [templateId, setTemplateId] = useState(initialTemplate)
  const template = MESSAGE_TEMPLATES.find((t) => t.id === templateId) || MESSAGE_TEMPLATES[0]
  const [text, setText] = useState(() => template.build({ firstName, client }))
  const [register, setRegister] = useState(true)

  const pick = (id) => {
    const t = MESSAGE_TEMPLATES.find((x) => x.id === id)
    setTemplateId(id)
    setText(t.build({ firstName, client }))
  }
  const changeContact = (id) => {
    setContactId(id)
    const c = withPhone.find((x) => x.id === id)
    setText(template.build({ firstName: firstNameOf(c?.name), client }))
  }

  async function logContact() {
    if (!register) return
    try {
      await api('/interactions', {
        method: 'POST',
        body: { client_id: client.id, kind: template.kind, summary: `${template.label} enviado pelo WhatsApp${contact ? ` para ${contact.name}` : ''}.` },
      })
      onSent?.()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function openWhatsapp() {
    const href = whatsappHref(contact?.phone)
    if (!href) return
    window.open(`${href}?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
    await logContact()
    toast('WhatsApp aberto com a mensagem.')
    onClose()
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      toast('Mensagem copiada.')
      await logContact()
      onClose()
    } catch {
      toast('Não deu para copiar: selecione o texto e copie.', 'error')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Mensagem · ${client.name}`}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={copy}>
            <Copy className="h-4 w-4" /> Copiar
          </button>
          <button type="button" className="btn-primary" onClick={openWhatsapp} disabled={!contact}>
            <MessageCircle className="h-4 w-4" /> Abrir no WhatsApp
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {MESSAGE_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => pick(t.id)}
              className={cx(
                'rounded-lg border px-2.5 py-1 text-xs font-medium transition',
                t.id === templateId
                  ? 'border-accent-500 bg-accent-50 text-accent-700 dark:border-accent-400/60 dark:bg-accent-500/15 dark:text-accent-200'
                  : 'border-slate-300 text-brand-500 hover:border-slate-400 dark:border-white/10 dark:text-slate-400 dark:hover:border-white/20',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Field label="Para" htmlFor="msg-contact">
          {withPhone.length ? (
            <select id="msg-contact" className="input" value={contactId} onChange={(e) => changeContact(e.target.value)}>
              {withPhone.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.is_decision_maker ? ' (decide)' : ''} · {c.phone}
                </option>
              ))}
            </select>
          ) : (
            <p className="muted text-sm">Nenhum contato com WhatsApp na ficha. Dá pra copiar o texto e mandar no grupo.</p>
          )}
        </Field>
        <Field label="Mensagem" htmlFor="msg-text" hint="Revise antes de enviar. Trechos entre [colchetes] são pra completar.">
          <textarea id="msg-text" className="input font-[inherit]" rows={9} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-brand-700 dark:text-slate-300">
          <input type="checkbox" checked={register} onChange={(e) => setRegister(e.target.checked)} className="h-4 w-4 rounded accent-accent-500" />
          Registrar na linha do tempo (conta como contato com o cliente)
        </label>
      </div>
    </Modal>
  )
}
