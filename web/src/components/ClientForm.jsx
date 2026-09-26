// Formulário de criar/editar cliente (modal).
// O token próprio da Meta é "só escrita": depois de salvo, a tela só mostra
// que existe um token, nunca o valor (ele fica criptografado no banco).
import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { api } from '../lib/api.js'
import { CLIENT_TAGS } from '../lib/tags.js'
import { CLIENT_STATUS, LINK_FIELDS, RESULT_METRIC_OPTIONS } from '../lib/constants.js'
import { formatGoogleId } from '../lib/format.js'
import { useData } from '../lib/data.jsx'
import Modal from './Modal.jsx'
import { Field, Spinner, TagChip } from './ui.jsx'
import { useToast } from './Toast.jsx'

const EMPTY = {
  name: '',
  status: 'active',
  tags: [],
  manager: '',
  meta_ad_account_id: '',
  google_ads_customer_id: '',
  result_metric: 'auto',
  balance_alert_threshold: '100',
  monthly_budget: '',
  notes: '',
  meta_access_token: '',
  segment: '',
  city: '',
  fee_monthly: '',
  contract_start: '',
  billing_day: '',
  renewal_date: '',
  links: {},
  access_notes: '',
}

function fromClient(c) {
  if (!c) return EMPTY
  return {
    ...EMPTY,
    name: c.name || '',
    status: c.status || 'active',
    tags: c.tags || [],
    manager: c.manager || '',
    meta_ad_account_id: c.meta_ad_account_id || '',
    google_ads_customer_id: formatGoogleId(c.google_ads_customer_id),
    result_metric: c.result_metric || 'auto',
    balance_alert_threshold: c.balance_alert_threshold != null ? String(c.balance_alert_threshold) : '100',
    monthly_budget: c.monthly_budget != null ? String(c.monthly_budget) : '',
    notes: c.notes || '',
    segment: c.segment || '',
    city: c.city || '',
    fee_monthly: c.fee_monthly != null ? String(c.fee_monthly) : '',
    contract_start: c.contract_start || '',
    billing_day: c.billing_day != null ? String(c.billing_day) : '',
    renewal_date: c.renewal_date || '',
    links: { ...(c.links || {}) },
    access_notes: c.access_notes || '',
  }
}

export default function ClientForm({ open, client, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY)
  const [clearToken, setClearToken] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const { users } = useData()
  const toast = useToast()
  const editing = Boolean(client)

  useEffect(() => {
    if (open) {
      setForm(fromClient(client))
      setClearToken(false)
      setError(null)
    }
  }, [open, client])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const setLink = (key) => (e) => setForm((f) => ({ ...f, links: { ...f.links, [key]: e.target.value } }))
  const toggleTag = (id) =>
    setForm((f) => ({ ...f, tags: f.tags.includes(id) ? f.tags.filter((t) => t !== id) : [...f.tags, id] }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const body = { ...form }
    if (!body.meta_access_token) delete body.meta_access_token
    if (clearToken) body.clear_meta_token = true
    try {
      const { client: saved } = await api(editing ? `/clients/${client.id}` : '/clients', {
        method: editing ? 'PATCH' : 'POST',
        body,
      })
      toast(editing ? 'Cliente atualizado' : 'Cliente cadastrado')
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
      title={editing ? `Editar ${client.name}` : 'Novo cliente'}
      size="lg"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" form="client-form" className="btn-primary" disabled={busy}>
            {busy && <Spinner />}
            {editing ? 'Salvar alterações' : 'Cadastrar cliente'}
          </button>
        </>
      }
    >
      <form id="client-form" onSubmit={submit} className="space-y-5">
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Nome do cliente" htmlFor="cf-name" className="sm:col-span-2">
            <input id="cf-name" className="input" value={form.name} onChange={set('name')} required maxLength={120} />
          </Field>
          <Field label="Situação" htmlFor="cf-status">
            <select id="cf-status" className="input" value={form.status} onChange={set('status')}>
              {Object.entries(CLIENT_STATUS).map(([id, s]) => (
                <option key={id} value={id}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Etiquetas">
          <div className="flex flex-wrap gap-1.5">
            {CLIENT_TAGS.map((t) => (
              <TagChip key={t.id} id={t.id} selected={form.tags.includes(t.id)} onClick={() => toggleTag(t.id)} />
            ))}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Responsável na Pipe" htmlFor="cf-manager">
            <input id="cf-manager" className="input" value={form.manager} onChange={set('manager')} list="cf-team" maxLength={80} />
            <datalist id="cf-team">
              {users.map((u) => (
                <option key={u.id} value={u.name} />
              ))}
            </datalist>
          </Field>
          <Field label="Segmento" htmlFor="cf-segment">
            <input id="cf-segment" className="input" value={form.segment} onChange={set('segment')} maxLength={80} placeholder="Ex: odontologia, imobiliária" />
          </Field>
        </div>

        <fieldset className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <legend className="section-title px-1">Contrato</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Honorário mensal (R$)" htmlFor="cf-fee">
              <input id="cf-fee" className="input" inputMode="decimal" value={form.fee_monthly} onChange={set('fee_monthly')} placeholder="2000" />
            </Field>
            <Field label="Verba de mídia mensal (R$)" htmlFor="cf-budget">
              <input id="cf-budget" className="input" inputMode="decimal" value={form.monthly_budget} onChange={set('monthly_budget')} placeholder="3000" />
            </Field>
            <Field label="Dia da cobrança" htmlFor="cf-billing">
              <input id="cf-billing" type="number" min={1} max={31} className="input" value={form.billing_day} onChange={set('billing_day')} placeholder="10" />
            </Field>
            <Field label="Cliente desde" htmlFor="cf-start">
              <input id="cf-start" type="date" className="input" value={form.contract_start} onChange={set('contract_start')} />
            </Field>
            <Field label="Renovação do contrato" htmlFor="cf-renewal">
              <input id="cf-renewal" type="date" className="input" value={form.renewal_date} onChange={set('renewal_date')} />
            </Field>
            <Field label="Cidade" htmlFor="cf-city">
              <input id="cf-city" className="input" value={form.city} onChange={set('city')} maxLength={80} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <legend className="section-title px-1">Links e acessos</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {LINK_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} htmlFor={`cf-link-${f.key}`}>
                <input id={`cf-link-${f.key}`} className="input" value={form.links?.[f.key] || ''} onChange={setLink(f.key)} maxLength={500} placeholder={f.placeholder} />
              </Field>
            ))}
          </div>
          <Field label="Onde estão os acessos" htmlFor="cf-access" hint="Só diga ONDE estão (ex: cofre de senhas da Pipe, e-mail do cliente). Nunca cole senhas aqui." className="mt-4">
            <textarea id="cf-access" className="input min-h-[60px]" value={form.access_notes} onChange={set('access_notes')} maxLength={2000} />
          </Field>
        </fieldset>

        <fieldset className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <legend className="section-title px-1">Contas de anúncio</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ID da conta Meta Ads" htmlFor="cf-meta" hint="Ex: act_1234567890 ou só os números.">
              <input id="cf-meta" className="input" value={form.meta_ad_account_id} onChange={set('meta_ad_account_id')} placeholder="act_…" />
            </Field>
            <Field label="ID do cliente Google Ads" htmlFor="cf-google" hint="Ex: 123-456-7890 (precisa estar na MCC da Pipe).">
              <input id="cf-google" className="input" value={form.google_ads_customer_id} onChange={set('google_ads_customer_id')} placeholder="123-456-7890" />
            </Field>
            <Field label="O que conta como resultado (Meta)" htmlFor="cf-metric">
              <select id="cf-metric" className="input" value={form.result_metric} onChange={set('result_metric')}>
                {RESULT_METRIC_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Alertar quando o saldo ficar abaixo de (R$)" htmlFor="cf-threshold" hint="Também alerta quando o saldo dura menos de 7 dias.">
              <input id="cf-threshold" className="input" inputMode="decimal" value={form.balance_alert_threshold} onChange={set('balance_alert_threshold')} />
            </Field>
          </div>

          <details className="mt-4 text-sm">
            <summary className="muted flex cursor-pointer items-center gap-1.5 text-xs font-semibold">
              <KeyRound className="h-3.5 w-3.5" /> Token próprio da Meta (só se a conta NÃO estiver no Business Manager da Pipe)
            </summary>
            <div className="mt-3 space-y-2">
              {client?.has_meta_token && !clearToken && (
                <p className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                  Este cliente tem um token salvo (criptografado).
                  <button type="button" className="font-semibold underline" onClick={() => setClearToken(true)}>
                    Remover token
                  </button>
                </p>
              )}
              {clearToken && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                  O token será removido ao salvar. O cliente volta a usar o token do usuário do sistema.
                </p>
              )}
              <input
                type="password"
                autoComplete="off"
                className="input font-mono"
                value={form.meta_access_token}
                onChange={set('meta_access_token')}
                placeholder={client?.has_meta_token ? 'Colar um novo token para substituir' : 'Colar token de acesso'}
              />
            </div>
          </details>
        </fieldset>

        <Field label="Observações" htmlFor="cf-notes">
          <textarea id="cf-notes" className="input min-h-[90px]" value={form.notes} onChange={set('notes')} maxLength={4000} placeholder="Acessos, combinados com o cliente, horários de atendimento…" />
        </Field>
      </form>
    </Modal>
  )
}
