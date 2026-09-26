// Detalhe de um lead (modal): dados, próximo passo, histórico de contatos e
// as ações do funil (mudar etapa, registrar contato, fechar, perder, excluir).
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ExternalLink, MessageCircle, Pencil, Plus, RotateCcw, Trash2, Trophy, XCircle } from 'lucide-react'
import { api } from '../lib/api.js'
import { LEAD_STAGES, LOST_REASONS, OPEN_STAGES, stageLabel } from '../lib/constants.js'
import { dateBR, daysUntil, linkHref, money, relativeDay, timeAgo, whatsappHref } from '../lib/format.js'
import ConfirmDialog from './ConfirmDialog.jsx'
import InteractionForm from './InteractionForm.jsx'
import LeadForm from './LeadForm.jsx'
import Modal from './Modal.jsx'
import Timeline from './Timeline.jsx'
import { cx, Field, LevelBadge, Spinner } from './ui.jsx'
import { useToast } from './Toast.jsx'

function Info({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="muted text-[11px] font-semibold uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium">{children || '—'}</dd>
    </div>
  )
}

export default function LeadDetail({ leadId, onClose, onChanged }) {
  const [data, setData] = useState(null)
  const [modal, setModal] = useState(null) // 'edit' | 'contact' | 'win' | 'lose' | 'delete'
  const [lost, setLost] = useState({ reason: LOST_REASONS[0], detail: '' })
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const navigate = useNavigate()

  // onClose chega como função nova a cada render do pai; guardar numa ref evita
  // recarregar o lead toda vez que o quadro do funil atualiza.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const load = useCallback(async () => {
    if (!leadId) return
    try {
      setData(await api(`/leads/${leadId}`))
    } catch (err) {
      toast(err.message, 'error')
      onCloseRef.current()
    }
  }, [leadId, toast])

  useEffect(() => {
    setData(null)
    load()
  }, [load])

  const reload = useCallback(() => Promise.all([load(), onChanged?.()]), [load, onChanged])

  async function patch(body, message) {
    setBusy(true)
    try {
      await api(`/leads/${leadId}`, { method: 'PATCH', body })
      toast(message)
      await reload()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function win() {
    try {
      const { client } = await api(`/leads/${leadId}/win`, { method: 'POST' })
      toast(`${client.name} agora é cliente da Pipe`)
      await onChanged?.()
      onClose()
      navigate(`/clientes/${client.id}`)
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function remove() {
    try {
      await api(`/leads/${leadId}`, { method: 'DELETE' })
      toast('Lead excluído')
      await onChanged?.()
      onClose()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const lead = data?.lead
  const isOpen = lead && OPEN_STAGES.includes(lead.stage)
  const stageIndex = lead ? OPEN_STAGES.indexOf(lead.stage) : -1
  const nextIn = lead ? daysUntil(lead.next_step_at) : null
  const wa = lead ? whatsappHref(lead.contact_phone) : null

  return (
    <Modal open={Boolean(leadId)} onClose={onClose} title={lead ? lead.company : 'Carregando…'} size="lg">
      {!lead ? (
        <div className="flex justify-center py-10">
          <Spinner className="h-6 w-6 text-brand-400" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <LevelBadge level={lead.stage === 'won' ? 'ok' : lead.stage === 'lost' ? 'critical' : 'never'}>{stageLabel(lead.stage)}</LevelBadge>
            {lead.fee_proposed != null && <span className="tabular text-sm font-bold">{money(lead.fee_proposed)}/mês</span>}
            {lead.media_budget != null && <span className="muted text-xs">+ verba {money(lead.media_budget)}/mês</span>}
            <span className="muted ml-auto text-xs">Nesta etapa {timeAgo(lead.stage_changed_at)}</span>
          </div>

          {lead.stage === 'lost' && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              Perdido {lead.lost_at ? `em ${dateBR(lead.lost_at)}` : ''}{lead.lost_reason ? `: ${lead.lost_reason}` : ''}
            </p>
          )}

          {isOpen && (
            <div
              className={cx(
                'rounded-xl border p-3',
                !lead.next_step_at
                  ? 'border-dashed border-slate-300 dark:border-slate-700'
                  : nextIn < 0
                    ? 'border-rose-200 bg-rose-50/60 dark:border-rose-500/30 dark:bg-rose-500/5'
                    : 'border-slate-200 dark:border-slate-800',
              )}
            >
              <p className="section-title">Próximo passo</p>
              {lead.next_step || lead.next_step_at ? (
                <p className={cx('mt-1 text-sm font-semibold', nextIn < 0 && 'text-rose-700 dark:text-rose-300')}>
                  {lead.next_step || 'Sem descrição'}
                  {lead.next_step_at && <span className="font-normal"> · {dateBR(lead.next_step_at)} ({relativeDay(lead.next_step_at)})</span>}
                </p>
              ) : (
                <p className="muted mt-1 text-sm">Nenhum próximo passo marcado: lead parado tende a esfriar.</p>
              )}
            </div>
          )}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Info label="Contato">{lead.contact_name}</Info>
            <Info label="Telefone">
              {lead.contact_phone && (
                <span className="inline-flex items-center gap-1">
                  {lead.contact_phone}
                  {wa && (
                    <a href={wa} target="_blank" rel="noreferrer" className="text-emerald-600 hover:text-emerald-700" aria-label="Abrir WhatsApp">
                      <MessageCircle className="h-3.5 w-3.5" />
                    </a>
                  )}
                </span>
              )}
            </Info>
            <Info label="E-mail">{lead.contact_email}</Info>
            <Info label="Instagram">
              {lead.instagram && (
                <a href={linkHref('instagram', lead.instagram)} target="_blank" rel="noreferrer" className="hover:underline">
                  {lead.instagram}
                </a>
              )}
            </Info>
            <Info label="Origem">{lead.source}</Info>
            <Info label="Responsável">{lead.owner}</Info>
            <Info label="Segmento">{lead.segment}</Info>
            <Info label="Proposta">
              {lead.proposal_url && (
                <a href={linkHref('proposta', lead.proposal_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                  Abrir deck <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </Info>
            <Info label="Criado">{dateBR(lead.created_at)}</Info>
          </dl>
          {lead.notes && <p className="whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-950/50">{lead.notes}</p>}

          <div className="flex flex-wrap gap-2 border-y border-slate-100 py-3 dark:border-slate-800">
            {isOpen && (
              <>
                <button type="button" className="btn-primary" onClick={() => setModal('contact')}>
                  <Plus className="h-4 w-4" /> Registrar contato
                </button>
                {stageIndex < OPEN_STAGES.length - 1 && (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => patch({ stage: OPEN_STAGES[stageIndex + 1] }, `Movido para ${stageLabel(OPEN_STAGES[stageIndex + 1])}`)}
                  >
                    <ArrowRight className="h-4 w-4" /> {stageLabel(OPEN_STAGES[stageIndex + 1])}
                  </button>
                )}
                <select
                  className="input w-auto py-2"
                  value={lead.stage}
                  onChange={(e) => patch({ stage: e.target.value }, `Movido para ${stageLabel(e.target.value)}`)}
                  aria-label="Mudar etapa"
                  disabled={busy}
                >
                  {LEAD_STAGES.filter((s) => OPEN_STAGES.includes(s.id)).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setModal('win')}>
                  <Trophy className="h-4 w-4" /> Fechou!
                </button>
                <button type="button" className="btn-ghost text-rose-600 dark:text-rose-300" onClick={() => setModal('lose')}>
                  <XCircle className="h-4 w-4" /> Perdido
                </button>
              </>
            )}
            {lead.stage === 'won' && lead.client_id && (
              <button type="button" className="btn-primary" onClick={() => { onClose(); navigate(`/clientes/${lead.client_id}`) }}>
                Abrir ficha do cliente
              </button>
            )}
            {lead.stage === 'lost' && (
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => patch({ stage: 'lead' }, 'Lead reaberto')}>
                <RotateCcw className="h-4 w-4" /> Reabrir
              </button>
            )}
            <span className="flex-1" />
            <button type="button" className="icon-btn" onClick={() => setModal('edit')} aria-label="Editar lead">
              <Pencil className="h-4 w-4" />
            </button>
            <button type="button" className="icon-btn hover:text-rose-600" onClick={() => setModal('delete')} aria-label="Excluir lead">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div>
            <h3 className="section-title mb-1">Histórico</h3>
            <div className="-mx-4">
              <Timeline interactions={data.interactions} onChanged={reload} emptyText="Registre cada conversa: o próximo passo aparece na tela Hoje." />
            </div>
          </div>
        </div>
      )}

      <InteractionForm open={modal === 'contact'} leadId={leadId} targetName={lead?.company} onClose={() => setModal(null)} onSaved={reload} />
      <LeadForm open={modal === 'edit'} lead={lead} onClose={() => setModal(null)} onSaved={reload} />
      <ConfirmDialog
        open={modal === 'win'}
        title="Fechou o contrato?"
        message={`${lead?.company} vira cliente da Pipe: a ficha é criada com honorário, verba, contato e o histórico da negociação.`}
        confirmLabel="Sim, virar cliente"
        tone="success"
        onConfirm={win}
        onClose={() => setModal(null)}
      />
      <ConfirmDialog
        open={modal === 'delete'}
        title="Excluir lead"
        message={`Excluir ${lead?.company} do funil? O histórico de contatos dele também é apagado (a menos que já tenha virado cliente).`}
        onConfirm={remove}
        onClose={() => setModal(null)}
      />
      <Modal
        open={modal === 'lose'}
        onClose={() => setModal(null)}
        title="Marcar como perdido"
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setModal(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={busy}
              onClick={async () => {
                await patch({ stage: 'lost', lost_reason: [lost.reason, lost.detail].filter(Boolean).join(' — ') }, 'Lead marcado como perdido')
                setModal(null)
              }}
            >
              Marcar como perdido
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Motivo" htmlFor="lost-reason">
            <select id="lost-reason" className="input" value={lost.reason} onChange={(e) => setLost({ ...lost, reason: e.target.value })}>
              {LOST_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Detalhe (opcional)" htmlFor="lost-detail">
            <input id="lost-detail" className="input" value={lost.detail} onChange={(e) => setLost({ ...lost, detail: e.target.value })} maxLength={150} />
          </Field>
          <p className="muted text-xs">O motivo entra nos Números da agência, pra ver onde o funil vaza.</p>
        </div>
      </Modal>
    </Modal>
  )
}
