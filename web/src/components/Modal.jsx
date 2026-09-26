// Modal próprio (nada de confirm()/alert() nativo, que trava testes
// automatizados e não segue o visual do app). Fecha com Esc e no fundo.
// Pode abrir um modal por cima de outro (ex: "Registrar contato" dentro do
// detalhe do lead): uma pilha garante que o Esc só feche o de cima.
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cx } from './ui.jsx'

const openStack = []

export default function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const token = {}
    openStack.push(token)
    const onKey = (e) => {
      if (e.key === 'Escape' && openStack[openStack.length - 1] === token) onClose?.()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Foca o primeiro campo pra já sair digitando.
    const t = setTimeout(() => {
      panelRef.current?.querySelector('input:not([type=hidden]), textarea, select')?.focus()
    }, 30)
    return () => {
      openStack.splice(openStack.indexOf(token), 1)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      clearTimeout(t)
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-brand-950/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panelRef}
        className={cx(
          'relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-2xl',
          size === 'sm' ? 'sm:max-w-md' : size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-xl',
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-base font-bold text-brand-800 dark:text-white">{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="scroll-thin overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
