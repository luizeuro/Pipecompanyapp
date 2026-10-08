// Manual da Pipe: a agência visual na tela. No topo, o mapa da jornada do
// cliente (cada etapa leva pra tela do sistema onde ela acontece); embaixo,
// os capítulos (como trabalhamos, padrões, ferramentas). É o onboarding de
// quem entra na equipe. Todo mundo lê; admin edita (e pode voltar ao padrão).
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  BarChart3,
  BookOpen,
  FileSignature,
  FileText,
  Handshake,
  ListChecks,
  Pencil,
  Rocket,
  RotateCcw,
  Sparkles,
  Target,
} from 'lucide-react'
import { api } from '../lib/api.js'
import { dateBR } from '../lib/format.js'
import Markdown from '../components/Markdown.jsx'
import Modal from '../components/Modal.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { useToast } from '../components/Toast.jsx'
import { cx, Field, PageHeader, Spinner } from '../components/ui.jsx'

// A jornada do cliente na Pipe, etapa por etapa, com a tela onde acontece.
const JOURNEY = [
  { n: 1, title: 'Prospecção', text: 'Lead entra no funil com próximo passo e data.', icon: Target, to: '/funil' },
  { n: 2, title: 'Proposta', text: 'Diagnóstico, mercado e deck da Pipe.', icon: FileSignature, to: '/funil' },
  { n: 3, title: 'Fechamento', text: '"Fechou!" cria o cliente com o histórico.', icon: Handshake, to: '/funil' },
  { n: 4, title: 'Onboarding', text: 'Acessos, briefing, metas e rastreamento.', icon: ListChecks, to: '/clientes' },
  { n: 5, title: 'Lançamento', text: 'Campanhas, páginas e automações no ar.', icon: Rocket, to: '/contas' },
  { n: 6, title: 'Operação', text: 'Otimização semanal, saldo e tarefas.', icon: Sparkles, to: '/' },
  { n: 7, title: 'Relatório', text: 'Resultado, aprendizado e plano do mês.', icon: FileText, to: '/relatorios' },
  { n: 8, title: 'Expansão', text: 'Renovação e a próxima solução.', icon: BarChart3, to: '/numeros' },
]

function JourneyMap() {
  return (
    <section className="card-glow mb-6 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="eyebrow">Mapa da agência</div>
          <h2 className="text-base font-semibold text-brand-900 dark:text-white">A jornada do cliente na Pipe</h2>
        </div>
        <p className="muted max-w-md text-xs">Cada etapa abre a tela do sistema onde ela acontece. Detalhes no capítulo "Jornada do cliente".</p>
      </div>
      <ol className="scroll-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {JOURNEY.map((s, i) => (
          <li key={s.n} className="flex min-w-[152px] flex-1 items-stretch">
            <Link
              to={s.to}
              className="group flex w-full flex-col rounded-xl border border-slate-200 bg-white p-3 transition hover:-translate-y-0.5 hover:border-accent-400 dark:border-white/[0.07] dark:bg-white/[0.02] dark:hover:border-accent-400/50 dark:hover:bg-white/[0.04]"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-slate-400">0{s.n}</span>
                <s.icon className="h-4 w-4 text-accent-500 transition group-hover:scale-110 dark:text-accent-300" aria-hidden="true" />
              </div>
              <div className="mt-2 text-sm font-semibold text-brand-900 dark:text-white">{s.title}</div>
              <p className="muted mt-0.5 text-xs leading-snug">{s.text}</p>
            </Link>
            {i < JOURNEY.length - 1 && (
              <span className="mx-0.5 hidden items-center text-slate-300 dark:text-slate-600 lg:flex" aria-hidden="true">
                ›
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

function EditChapter({ chapter, onClose, onSaved }) {
  const toast = useToast()
  const [title, setTitle] = useState(chapter.title)
  const [content, setContent] = useState(chapter.content)
  const [saving, setSaving] = useState(false)
  async function save(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await api(`/playbooks/${chapter.slug}`, { method: 'PUT', body: { title, content } })
      toast('Capítulo salvo.')
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
      setSaving(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Editar capítulo"
      size="lg"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="chapter-form" className="btn-primary" disabled={saving}>
            {saving && <Spinner />} Salvar
          </button>
        </>
      }
    >
      <form id="chapter-form" onSubmit={save} className="space-y-4">
        <Field label="Título" htmlFor="ch-title">
          <input id="ch-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Texto (Markdown)" htmlFor="ch-content" hint="## título, **negrito**, - lista, - [ ] checklist, | tabela |.">
          <textarea id="ch-content" className="input font-mono text-xs leading-relaxed" rows={22} value={content} onChange={(e) => setContent(e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}

export default function Manual({ user }) {
  const toast = useToast()
  const [data, setData] = useState(null)
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState(false)
  const [resetting, setResetting] = useState(false)
  const isAdmin = user?.role === 'admin'

  const load = () =>
    api('/playbooks')
      .then(setData)
      .catch((err) => toast(err.message, 'error'))
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const chapters = data?.playbooks || []
  const slug = params.get('cap') || chapters[0]?.slug
  const chapter = chapters.find((c) => c.slug === slug) || chapters[0]
  const index = chapters.findIndex((c) => c.slug === chapter?.slug)
  const grouped = useMemo(
    () => (data ? data.groups.map((g) => ({ ...g, items: chapters.filter((c) => c.group === g.id) })) : []),
    [data, chapters],
  )
  const go = (s) => {
    setParams({ cap: s }, { replace: true })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      <PageHeader title="Manual da Pipe" subtitle="Como a Pipe trabalha. Comece por aqui se você acabou de chegar na equipe." />
      <JourneyMap />

      {!data ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6 text-accent-400" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <nav className="lg:sticky lg:top-6 lg:self-start" aria-label="Capítulos do manual">
            <div className="card p-2">
              {grouped.map((g) => (
                <div key={g.id} className="mb-1 last:mb-0">
                  <div className="eyebrow px-2.5 pb-1 pt-2">{g.label}</div>
                  {g.items.map((c) => (
                    <button
                      key={c.slug}
                      type="button"
                      onClick={() => go(c.slug)}
                      className={cx(
                        'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition',
                        c.slug === chapter?.slug
                          ? 'bg-accent-50 font-medium text-accent-700 dark:bg-white/[0.07] dark:text-white'
                          : 'text-brand-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/[0.04] dark:hover:text-slate-100',
                      )}
                    >
                      <BookOpen className={cx('h-3.5 w-3.5 shrink-0', c.slug === chapter?.slug ? 'text-accent-500 dark:text-accent-300' : 'text-slate-400')} />
                      <span className="truncate">{c.title}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </nav>

          {chapter && (
            <article className="card min-w-0">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/[0.06]">
                <div className="min-w-0">
                  <div className="eyebrow">
                    Capítulo {String(index + 1).padStart(2, '0')} / {String(chapters.length).padStart(2, '0')}
                  </div>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight text-brand-900 dark:text-white">{chapter.title}</h2>
                  <p className="muted mt-0.5 text-sm">{chapter.summary}</p>
                  {chapter.edited && (
                    <p className="mt-1 font-mono text-[10.5px] text-slate-400">
                      editado por {chapter.updated_by} em {dateBR(chapter.updated_at)}
                    </p>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex gap-1">
                    {chapter.edited && (
                      <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setResetting(true)} title="Voltar ao texto padrão">
                        <RotateCcw className="h-3.5 w-3.5" /> Padrão
                      </button>
                    )}
                    <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={() => setEditing(true)}>
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </button>
                  </div>
                )}
              </header>
              <div className="px-5 py-5">
                <Markdown text={chapter.content} className="manual" />
              </div>
              <footer className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 dark:border-white/[0.06]">
                <button type="button" className="btn-ghost px-2 py-1 text-xs" disabled={index <= 0} onClick={() => go(chapters[index - 1].slug)}>
                  ← {chapters[index - 1]?.title || 'Início'}
                </button>
                <button
                  type="button"
                  className="btn-ghost px-2 py-1 text-xs"
                  disabled={index >= chapters.length - 1}
                  onClick={() => go(chapters[index + 1].slug)}
                >
                  {chapters[index + 1]?.title || 'Fim'} →
                </button>
              </footer>
            </article>
          )}
        </div>
      )}

      {editing && chapter && (
        <EditChapter
          chapter={chapter}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            load()
          }}
        />
      )}
      <ConfirmDialog
        open={resetting}
        title="Voltar ao texto padrão"
        message={`O capítulo "${chapter?.title}" volta ao texto original do Sistema Pipe. A versão editada é descartada.`}
        confirmLabel="Voltar ao padrão"
        onConfirm={async () => {
          try {
            await api(`/playbooks/${chapter.slug}`, { method: 'DELETE' })
            toast('Capítulo voltou ao padrão.')
            load()
          } catch (err) {
            toast(err.message, 'error')
          }
        }}
        onClose={() => setResetting(false)}
      />
    </>
  )
}
