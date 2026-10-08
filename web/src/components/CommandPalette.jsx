// Busca rápida (⌘K / Ctrl+K): pula pra qualquer tela ou cliente sem tirar a
// mão do teclado. Setas pra navegar, Enter pra abrir, Esc pra fechar.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CornerDownLeft, Search, User } from 'lucide-react'
import { useData } from '../lib/data.jsx'
import { normalizeSearch } from '../lib/format.js'
import { cx, HealthBadge } from './ui.jsx'

export default function CommandPalette({ open, onClose, pages }) {
  const { clients } = useData()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    const t = setTimeout(() => inputRef.current?.focus(), 10)
    return () => clearTimeout(t)
  }, [open])

  const results = useMemo(() => {
    const q = normalizeSearch(query)
    const pageItems = pages
      .filter((p) => !q || normalizeSearch(p.label).includes(q))
      .map((p) => ({ key: `p-${p.to}`, kind: 'page', label: p.label, icon: p.icon, to: p.to }))
    const clientItems = clients
      .filter((c) => q && normalizeSearch(c.name).includes(q))
      .slice(0, 8)
      .map((c) => ({ key: `c-${c.id}`, kind: 'client', label: c.name, client: c, to: `/clientes/${c.id}` }))
    // Com texto, cliente vem primeiro (é o que mais se procura).
    return q ? [...clientItems, ...pageItems] : pageItems
  }, [query, pages, clients])

  useEffect(() => setActive(0), [query])
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const go = (item) => {
    if (!item) return
    navigate(item.to)
    onClose()
  }
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(results[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Busca rápida">
      <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" onClick={onClose} />
      <div className="card relative w-full max-w-xl animate-fade-up overflow-hidden !bg-white dark:!bg-slate-950/95">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 dark:border-white/[0.07]">
          <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar cliente ou tela…"
            className="h-12 w-full bg-transparent text-sm text-brand-800 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
            aria-label="Buscar"
          />
          <span className="kbd">esc</span>
        </div>
        <ul ref={listRef} className="scroll-thin max-h-[52vh] overflow-y-auto p-2" role="listbox">
          {results.length === 0 && <li className="muted px-3 py-6 text-center text-sm">Nada encontrado.</li>}
          {results.map((item, i) => {
            const Icon = item.kind === 'client' ? User : item.icon
            return (
              <li key={item.key} data-index={i} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(item)}
                  className={cx(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition',
                    i === active
                      ? 'bg-accent-50 text-brand-900 dark:bg-white/[0.07] dark:text-white'
                      : 'text-brand-600 dark:text-slate-300',
                  )}
                >
                  {Icon && <Icon className={cx('h-4 w-4 shrink-0', i === active ? 'text-accent-500 dark:text-accent-300' : 'text-slate-400')} />}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.kind === 'client' && <HealthBadge health={item.client.health} />}
                  <span className="eyebrow hidden sm:inline">{item.kind === 'client' ? 'cliente' : 'tela'}</span>
                  {i === active ? <CornerDownLeft className="h-3.5 w-3.5 text-slate-400" /> : <ArrowRight className="h-3.5 w-3.5 opacity-0" />}
                </button>
              </li>
            )
          })}
        </ul>
        <div className="flex items-center gap-3 border-t border-slate-200 px-4 py-2 text-[11px] text-slate-400 dark:border-white/[0.07]">
          <span className="flex items-center gap-1"><span className="kbd">↑</span><span className="kbd">↓</span> navegar</span>
          <span className="flex items-center gap-1"><span className="kbd">↵</span> abrir</span>
        </div>
      </div>
    </div>
  )
}
