// Configurações: o que está ligado (integrações), agenda das verificações,
// equipe com acesso e troca de senha. Nenhum segredo aparece aqui: a API
// só devolve se cada variável está configurada ou não.
import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, CircleDashed, Mail, Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api.js'
import { useData } from '../lib/data.jsx'
import { dateTimeBR, timeAgo } from '../lib/format.js'
import CheckNowButton from '../components/CheckNowButton.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { useToast } from '../components/Toast.jsx'
import { cx, Field, PageHeader, Spinner } from '../components/ui.jsx'

const INTEGRATIONS = [
  { key: 'db', label: 'Banco de dados (Supabase)', vars: 'SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY' },
  { key: 'meta', label: 'Meta Ads', vars: 'META_SYSTEM_USER_TOKEN (e META_APP_SECRET, se o app exigir)' },
  { key: 'google', label: 'Google Ads', vars: 'GOOGLE_ADS_DEVELOPER_TOKEN, _CLIENT_ID, _CLIENT_SECRET, _REFRESH_TOKEN, _LOGIN_CUSTOMER_ID' },
  { key: 'email', label: 'E-mail de alertas (Resend)', vars: 'RESEND_API_KEY, ALERT_EMAIL_FROM, ALERT_EMAIL_TO' },
  { key: 'cron', label: 'Verificação automática', vars: 'CRON_SECRET (na Vercel e nos Secrets do GitHub)' },
  { key: 'encryption', label: 'Criptografia de tokens', vars: 'ENCRYPTION_KEY (64 caracteres hexadecimais)' },
  { key: 'turnstile', label: 'CAPTCHA no login (opcional)', vars: 'TURNSTILE_SECRET_KEY, VITE_TURNSTILE_SITE_KEY' },
]

function Section({ title, description, children, actions }) {
  return (
    <section className="card">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
        <div>
          <h2 className="text-sm font-bold">{title}</h2>
          {description && <p className="muted mt-0.5 text-xs">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

export default function Settings({ user }) {
  const { users, refresh } = useData()
  const toast = useToast()
  const [status, setStatus] = useState(null)
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'member' })
  const [pwd, setPwd] = useState({ current: '', next: '' })
  const [busy, setBusy] = useState(null)
  const [removing, setRemoving] = useState(null)
  const isAdmin = user.role === 'admin'

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api('/settings/status'))
    } catch (err) {
      toast(err.message, 'error')
    }
  }, [toast])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  async function run(key, fn, success) {
    setBusy(key)
    try {
      await fn()
      if (success) toast(success)
      return true
    } catch (err) {
      toast(err.message, 'error')
      return false
    } finally {
      setBusy(null)
    }
  }

  async function addUser(e) {
    e.preventDefault()
    const ok = await run('add-user', () => api('/users', { method: 'POST', body: newUser }), `${newUser.name} agora tem acesso`)
    if (ok) {
      setNewUser({ name: '', email: '', password: '', role: 'member' })
      refresh()
    }
  }

  async function changeRole(u, role) {
    const ok = await run(`role-${u.id}`, () => api(`/users/${u.id}`, { method: 'PATCH', body: { role } }), 'Papel atualizado')
    if (ok) refresh()
  }

  async function changePassword(e) {
    e.preventDefault()
    const ok = await run('pwd', () => api('/auth/password', { method: 'POST', body: pwd }), 'Senha alterada')
    if (ok) setPwd({ current: '', next: '' })
  }

  const integrations = status ? { ...status.integrations, db: status.db === 'supabase' } : null
  const lc = status?.last_check

  return (
    <>
      <PageHeader title="Configurações" subtitle="Integrações, verificações automáticas e equipe." />

      <div className="grid gap-6 xl:grid-cols-2">
        <Section
          title="Integrações"
          description="Configuradas nas variáveis de ambiente da Vercel. Depois de mudar uma, faça Redeploy."
        >
          {!integrations ? (
            <Spinner className="h-5 w-5 text-brand-400" />
          ) : (
            <ul className="space-y-3">
              {INTEGRATIONS.map((i) => {
                const ok = integrations[i.key]
                return (
                  <li key={i.key} className="flex items-start gap-3">
                    {ok ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Configurado" />
                    ) : (
                      <CircleDashed className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-label="Pendente" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {i.label}
                        <span className={cx('ml-2 text-xs font-medium', ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-400')}>
                          {ok ? 'configurado' : i.key === 'db' && status.db === 'memory' ? 'modo demonstração (local)' : 'pendente'}
                        </span>
                      </p>
                      <p className="muted break-words font-mono text-[11px]">{i.vars}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Section>

        <Section
          title="Verificações automáticas"
          description="O GitHub Actions chama a verificação 3x por dia (9h, 14h e 19h de Brasília)."
          actions={<CheckNowButton onDone={loadStatus} />}
        >
          {status ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="label">Última verificação geral</dt>
                <dd>{lc ? `${dateTimeBR(lc.at)} (${timeAgo(lc.at)})` : 'Nenhuma ainda'}</dd>
              </div>
              <div>
                <dt className="label">Resultado</dt>
                <dd>
                  {lc
                    ? `${lc.checked} cliente(s), ${lc.errors} com erro, ${lc.new_alerts ?? 0} alerta(s) novo(s)`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="label">Origem</dt>
                <dd>{lc ? (lc.trigger === 'cron' ? 'Automática (cron)' : lc.trigger.replace('manual:', 'Manual, por ')) : '—'}</dd>
              </div>
              <div>
                <dt className="label">Resumo diário por e-mail</dt>
                <dd>
                  A partir das {status.schedule.digest_hour} ({status.schedule.timezone})
                  {status.last_digest ? ` · último em ${dateTimeBR(status.last_digest.at)}` : ''}
                </dd>
              </div>
            </dl>
          ) : (
            <Spinner className="h-5 w-5 text-brand-400" />
          )}
          {isAdmin && (
            <button
              type="button"
              className="btn-secondary mt-4"
              disabled={busy === 'email' || !status?.integrations.email}
              title={status?.integrations.email ? '' : 'Configure o Resend primeiro'}
              onClick={() => run('email', () => api('/settings/test-email', { method: 'POST' }), 'E-mail de teste enviado')}
            >
              {busy === 'email' ? <Spinner /> : <Mail className="h-4 w-4" />} Enviar e-mail de teste
            </button>
          )}
        </Section>

        <Section title="Equipe" description={isAdmin ? 'Quem acessa o painel. Administradores gerenciam a equipe.' : 'Quem acessa o painel.'}>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-slate-800 dark:text-slate-200">
                  {u.name[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {u.name} {u.id === user.id && <span className="muted font-normal">(você)</span>}
                  </p>
                  <p className="muted truncate text-xs">{u.email}</p>
                </div>
                {isAdmin && u.id !== user.id ? (
                  <>
                    <select
                      className="input w-auto py-1 text-xs"
                      value={u.role}
                      onChange={(e) => changeRole(u, e.target.value)}
                      disabled={busy === `role-${u.id}`}
                      aria-label={`Papel de ${u.name}`}
                    >
                      <option value="member">Equipe</option>
                      <option value="admin">Administrador</option>
                    </select>
                    <button type="button" className="icon-btn hover:text-rose-600" onClick={() => setRemoving(u)} aria-label={`Remover ${u.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <span className="muted text-xs">{u.role === 'admin' ? 'Administrador' : 'Equipe'}</span>
                )}
              </li>
            ))}
          </ul>

          {isAdmin && (
            <form onSubmit={addUser} className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-950/50">
              <p className="text-sm font-semibold">Dar acesso a alguém</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nome" htmlFor="nu-name">
                  <input id="nu-name" className="input" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} required />
                </Field>
                <Field label="E-mail" htmlFor="nu-email">
                  <input id="nu-email" type="email" className="input" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required />
                </Field>
                <Field label="Senha provisória" htmlFor="nu-pass" hint="Mínimo de 8 caracteres. A pessoa troca depois em Configurações.">
                  <input
                    id="nu-pass"
                    type="password"
                    autoComplete="new-password"
                    className="input"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    minLength={8}
                    required
                  />
                </Field>
                <Field label="Papel" htmlFor="nu-role">
                  <select id="nu-role" className="input" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                    <option value="member">Equipe</option>
                    <option value="admin">Administrador</option>
                  </select>
                </Field>
              </div>
              <button type="submit" className="btn-primary" disabled={busy === 'add-user'}>
                {busy === 'add-user' ? <Spinner /> : <Plus className="h-4 w-4" />} Adicionar
              </button>
            </form>
          )}
        </Section>

        <Section title="Minha senha">
          <form onSubmit={changePassword} className="grid gap-3 sm:grid-cols-2">
            <Field label="Senha atual" htmlFor="pw-cur">
              <input id="pw-cur" type="password" autoComplete="current-password" className="input" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} required />
            </Field>
            <Field label="Nova senha" htmlFor="pw-new" hint="Mínimo de 8 caracteres.">
              <input id="pw-new" type="password" autoComplete="new-password" className="input" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} minLength={8} required />
            </Field>
            <div className="sm:col-span-2">
              <button type="submit" className="btn-primary" disabled={busy === 'pwd'}>
                {busy === 'pwd' && <Spinner />} Trocar senha
              </button>
            </div>
          </form>
        </Section>
      </div>

      <ConfirmDialog
        open={Boolean(removing)}
        title="Remover acesso"
        message={`Remover o acesso de ${removing?.name}? A pessoa sai do painel na hora. O histórico que ela registrou continua.`}
        confirmLabel="Remover"
        onConfirm={async () => {
          await run('remove', () => api(`/users/${removing.id}`, { method: 'DELETE' }), 'Acesso removido')
          refresh()
        }}
        onClose={() => setRemoving(null)}
      />
    </>
  )
}
