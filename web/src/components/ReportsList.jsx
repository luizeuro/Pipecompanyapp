// Lista de relatórios/análises (do cliente ou da agência). Cada um abre o texto
// completo em Markdown e tem "Copiar texto" pra colar direto no WhatsApp.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Copy, FileText, Trash2 } from 'lucide-react'
import { api } from '../lib/api.js'
import { reportKindLabel } from '../lib/constants.js'
import { dateBR, dateShort, timeAgo } from '../lib/format.js'
import ConfirmDialog from './ConfirmDialog.jsx'
import Markdown from './Markdown.jsx'
import { AgentBadge, cx, EmptyState } from './ui.jsx'
import { useToast } from './Toast.jsx'

const KIND_TONE = {
  report: 'bg-brand-100 text-brand-700 dark:bg-slate-800 dark:text-slate-200',
  analysis: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  daily: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
}

// Markdown → texto do WhatsApp (*negrito*, listas com •, sem #).
function toWhatsApp(md) {
  return String(md || '')
    .replace(/^#{1,6}\s*(.+)$/gm, '*$1*')
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1: $2')
}

function ReportItem({ report: r, showClient, onDelete }) {
  const [open, setOpen] = useState(false)
  const toast = useToast()

  async function copy() {
    try {
      await navigator.clipboard.writeText(`*${r.title}*\n\n${toWhatsApp(r.content)}`)
      toast('Texto copiado (formato WhatsApp)')
    } catch {
      toast('Não foi possível copiar', 'error')
    }
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
          <FileText className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className={cx('rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', KIND_TONE[r.kind])}>
              {reportKindLabel(r.kind)}
            </span>
            {showClient &&
              (r.client_id ? (
                <Link to={`/clientes/${r.client_id}?aba=relatorios`} className="font-semibold text-brand-600 hover:underline dark:text-slate-300">
                  {r.client_name}
                </Link>
              ) : (
                <span className="font-semibold text-brand-600 dark:text-slate-300">Agência</span>
              ))}
            {r.period_start && (
              <span className="text-slate-400">
                · {dateShort(r.period_start)} a {dateShort(r.period_end || r.period_start)}
              </span>
            )}
          </div>
          <button type="button" className="mt-1 block text-left text-sm font-semibold text-brand-800 hover:underline dark:text-white" onClick={() => setOpen((o) => !o)}>
            {r.title}
          </button>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
            {dateBR(r.created_at)} ({timeAgo(r.created_at)}) · {r.created_by || '—'} <AgentBadge name={r.created_by} />
          </p>
          {open && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/40">
              <Markdown text={r.content} />
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-start gap-1">
          <button type="button" className="icon-btn" onClick={copy} title="Copiar texto pro WhatsApp" aria-label="Copiar texto">
            <Copy className="h-4 w-4" />
          </button>
          {onDelete && (
            <button type="button" className="icon-btn hover:text-rose-600" onClick={() => onDelete(r)} aria-label="Excluir relatório">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button type="button" className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Fechar' : 'Ler relatório'} aria-expanded={open}>
            <ChevronDown className={cx('h-4 w-4 transition', open && 'rotate-180')} />
          </button>
        </div>
      </div>
    </li>
  )
}

export default function ReportsList({ reports, showClient = false, onChanged, emptyText }) {
  const toast = useToast()
  const [deleting, setDeleting] = useState(null)

  async function remove() {
    try {
      await api(`/reports/${deleting.id}`, { method: 'DELETE' })
      toast('Relatório excluído')
      await onChanged?.()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  if (!reports.length) return <EmptyState icon={FileText} title="Nenhum relatório ainda">{emptyText}</EmptyState>
  return (
    <>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {reports.map((r) => (
          <ReportItem key={r.id} report={r} showClient={showClient} onDelete={setDeleting} />
        ))}
      </ul>
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Excluir relatório"
        message={`Excluir "${deleting?.title}"? Não dá para desfazer.`}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}
