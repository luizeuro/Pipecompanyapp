// Confirmação de ação, no lugar do confirm() nativo do navegador.
// tone="danger" (padrão) pra excluir; tone="success" pra ação positiva (ex: fechou contrato).
import { useState } from 'react'
import Modal from './Modal.jsx'
import { Spinner } from './ui.jsx'

export default function ConfirmDialog({ open, title, message, confirmLabel = 'Excluir', tone = 'danger', onConfirm, onClose }) {
  const [busy, setBusy] = useState(false)

  async function handleConfirm() {
    setBusy(true)
    try {
      await onConfirm()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className={tone === 'success' ? 'btn bg-emerald-600 text-white hover:bg-emerald-700' : 'btn-danger'}
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy && <Spinner />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-brand-600 dark:text-slate-300">{message}</p>
    </Modal>
  )
}
