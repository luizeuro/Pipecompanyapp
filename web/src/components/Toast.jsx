// Avisos rápidos no canto da tela ("Cliente salvo", "Erro ao salvar...").
import { createContext, useCallback, useContext, useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { cx } from './ui.jsx'

const ToastContext = createContext(() => {})

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((list) => [...list, { id, message, type }])
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), type === 'error' ? 6000 : 3500)
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              'pointer-events-auto flex max-w-md items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg',
              t.type === 'error' ? 'bg-rose-600 text-white' : 'bg-brand-800 text-white dark:bg-white dark:text-brand-800',
            )}
          >
            {t.type === 'error' ? <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
