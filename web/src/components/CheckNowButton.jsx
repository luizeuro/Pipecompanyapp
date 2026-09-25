// Dispara a verificação das contas na hora (todas, ou só um cliente).
import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { api } from '../lib/api.js'
import { useData } from '../lib/data.jsx'
import { useToast } from './Toast.jsx'
import { Spinner } from './ui.jsx'

export default function CheckNowButton({ clientId, onDone, className = 'btn-secondary', label = 'Verificar agora' }) {
  const [busy, setBusy] = useState(false)
  const { refresh } = useData()
  const toast = useToast()

  async function run() {
    setBusy(true)
    try {
      const r = await api(clientId ? `/clients/${clientId}/check` : '/check', { method: 'POST' })
      const parts = [`${r.checked} cliente(s) verificado(s)`]
      if (r.new_alerts) parts.push(`${r.new_alerts} alerta(s) novo(s)`)
      if (r.errors) parts.push(`${r.errors} com erro`)
      toast(parts.join(' · '), r.errors ? 'error' : 'success')
      await Promise.all([refresh(), onDone?.()])
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" className={className} onClick={run} disabled={busy}>
      {busy ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
      {busy ? 'Verificando…' : label}
    </button>
  )
}
