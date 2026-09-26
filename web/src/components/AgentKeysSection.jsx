// Configurações → Agentes e API: chaves que dão acesso ao CRM pro Hermes (ou
// outro agente/automação) via MCP. A chave aparece uma única vez, na criação;
// depois só o começo dela ("pc_live_abcd…") fica visível. Só administradores.
import { useCallback, useEffect, useState } from 'react'
import { Bot, Copy, KeyRound, Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api.js'
import { dateBR, timeAgo } from '../lib/format.js'
import ConfirmDialog from './ConfirmDialog.jsx'
import Modal from './Modal.jsx'
import { Field, LevelBadge, Spinner } from './ui.jsx'
import { useToast } from './Toast.jsx'

function CopyField({ label, value, mono = true }) {
  const toast = useToast()
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <input readOnly className={`input ${mono ? 'font-mono text-xs' : ''}`} value={value} onFocus={(e) => e.target.select()} />
        <button
          type="button"
          className="btn-secondary shrink-0 px-3"
          onClick={() => navigator.clipboard.writeText(value).then(() => toast('Copiado'), () => toast('Não foi possível copiar', 'error'))}
          aria-label={`Copiar ${label}`}
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>
    </Field>
  )
}

export default function AgentKeysSection() {
  const toast = useToast()
  const [keys, setKeys] = useState(null)
  const [form, setForm] = useState({ name: 'Hermes do Mac', scope: 'read_write' })
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState(null)
  const [revoking, setRevoking] = useState(null)
  const mcpUrl = `${window.location.origin}/api/mcp`

  const load = useCallback(async () => {
    try {
      setKeys((await api('/api-keys')).keys)
    } catch (err) {
      toast(err.message, 'error')
      setKeys([])
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  async function create(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const { key } = await api('/api-keys', { method: 'POST', body: form })
      setCreated(key)
      await load()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function revoke() {
    try {
      await api(`/api-keys/${revoking.id}`, { method: 'DELETE' })
      toast('Chave revogada: o agente perdeu o acesso')
      await load()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <section className="card xl:col-span-2">
      <div className="flex flex-col gap-1 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Bot className="h-4 w-4 text-violet-500" aria-hidden="true" /> Agentes e API (Hermes)
        </h2>
        <p className="muted text-xs">
          O Hermes (ou outro agente) conecta no CRM pelo MCP com uma destas chaves. Ele lê tudo e cria tarefas, contatos, otimizações, leads e
          relatórios — nunca apaga nada nem mexe em equipe e configurações. Tudo que ele faz aparece com o selo "agente".
        </p>
      </div>
      <div className="space-y-5 px-5 py-4">
        <CopyField label="Endereço MCP do CRM" value={mcpUrl} />

        <div>
          <h3 className="section-title mb-2">Chaves</h3>
          {keys === null ? (
            <Spinner className="h-5 w-5 text-brand-400" />
          ) : keys.length === 0 ? (
            <p className="muted text-sm">Nenhuma chave criada ainda.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {keys.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <KeyRound className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {k.name} <span className="muted font-mono text-xs font-normal">{k.prefix}…</span>
                    </p>
                    <p className="muted text-xs">
                      {k.scope === 'read' ? 'Só leitura' : 'Leitura e escrita'} · criada em {dateBR(k.created_at)} por {k.created_by || '—'} · último uso:{' '}
                      {k.last_used_at ? timeAgo(k.last_used_at) : 'nunca'}
                    </p>
                  </div>
                  {k.revoked_at ? (
                    <LevelBadge level="never">Revogada</LevelBadge>
                  ) : (
                    <>
                      <LevelBadge level="ok">Ativa</LevelBadge>
                      <button type="button" className="icon-btn hover:text-rose-600" onClick={() => setRevoking(k)} aria-label={`Revogar ${k.name}`} title="Revogar">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={create} className="grid gap-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-950/50 sm:grid-cols-[1fr_200px_auto] sm:items-end">
          <Field label="Nome da chave" htmlFor="ak-name">
            <input id="ak-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={60} />
          </Field>
          <Field label="Permissão" htmlFor="ak-scope">
            <select id="ak-scope" className="input" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
              <option value="read_write">Leitura e escrita</option>
              <option value="read">Só leitura</option>
            </select>
          </Field>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? <Spinner /> : <Plus className="h-4 w-4" />} Gerar chave
          </button>
        </form>
      </div>

      <Modal
        open={Boolean(created)}
        onClose={() => setCreated(null)}
        title="Chave criada"
        footer={
          <button type="button" className="btn-primary" onClick={() => setCreated(null)}>
            Já copiei
          </button>
        }
      >
        {created && (
          <div className="space-y-4">
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              Copie agora: esta chave <strong>não aparece de novo</strong>. Se perder, revogue e gere outra.
            </p>
            <CopyField label="Chave" value={created.token} />
            <CopyField label="Linha para o arquivo ~/.hermes/.env" value={`PIPE_CRM_API_KEY=${created.token}`} />
            <p className="muted text-xs">
              No Hermes, a conexão já lê a chave dessa variável. Depois de salvar o .env, rode <code className="font-mono">hermes mcp test pipe_crm</code>.
            </p>
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={Boolean(revoking)}
        title="Revogar chave"
        message={`Revogar "${revoking?.name}"? O agente que usa essa chave perde o acesso na hora.`}
        confirmLabel="Revogar"
        onConfirm={revoke}
        onClose={() => setRevoking(null)}
      />
    </section>
  )
}
