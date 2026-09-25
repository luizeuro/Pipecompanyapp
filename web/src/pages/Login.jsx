// Login da equipe. Enquanto não existir nenhum usuário, a mesma tela vira o
// "primeiro acesso": cria o administrador da Pipe.
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { Field, Spinner } from '../components/ui.jsx'

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY

// Widget do Cloudflare Turnstile, só se a chave pública existir.
function Turnstile({ onToken, resetKey }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !ref.current) return
    let widgetId
    const render = () => {
      widgetId = window.turnstile.render(ref.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: onToken,
        'expired-callback': () => onToken(''),
        language: 'pt-br',
      })
    }
    if (window.turnstile) render()
    else {
      const s = document.createElement('script')
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      s.async = true
      s.onload = render
      document.head.appendChild(s)
    }
    return () => {
      if (widgetId != null && window.turnstile) window.turnstile.remove(widgetId)
    }
  }, [onToken, resetKey])
  if (!TURNSTILE_SITE_KEY) return null
  return <div ref={ref} className="min-h-[65px]" />
}

export default function Login({ needsSetup, onLoggedIn }) {
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [token, setToken] = useState('')
  const [resetKey, setResetKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { user } = needsSetup
        ? await api('/auth/setup', { method: 'POST', body: form })
        : await api('/auth/login', { method: 'POST', body: { email: form.email, password: form.password, turnstileToken: token } })
      onLoggedIn(user)
    } catch (err) {
      setError(err.message)
      // Token do Turnstile é de uso único: gera outro pra próxima tentativa.
      setToken('')
      setResetKey((k) => k + 1)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <div className="flex items-center justify-center bg-ink px-6 py-10 dark:bg-brand-800 lg:w-[44%] lg:py-0">
        <div className="max-w-sm text-center lg:text-left">
          <img src="/pipe-logo.png" alt="Pipe Company" className="logo-screen mx-auto h-28 w-28 lg:mx-0 lg:h-40 lg:w-40" />
          <h1 className="mt-6 text-2xl font-bold text-white lg:text-3xl">Monitor de contas</h1>
          <p className="mt-2 text-sm leading-relaxed text-brand-200">
            Saldo, veiculação, otimizações e pendências de todos os clientes de tráfego da Pipe num lugar só.
          </p>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <div>
            <h2 className="text-xl font-bold text-brand-800 dark:text-white">{needsSetup ? 'Primeiro acesso' : 'Entrar'}</h2>
            <p className="muted mt-1 text-sm">
              {needsSetup
                ? 'Crie o acesso de administrador. Depois você cadastra o resto da equipe em Configurações.'
                : 'Use o e-mail e a senha que a Pipe cadastrou para você.'}
            </p>
          </div>
          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300" role="alert">
              {error}
            </p>
          )}
          {needsSetup && (
            <Field label="Seu nome" htmlFor="l-name">
              <input id="l-name" className="input" value={form.name} onChange={set('name')} required autoComplete="name" />
            </Field>
          )}
          <Field label="E-mail" htmlFor="l-email">
            <input id="l-email" type="email" className="input" value={form.email} onChange={set('email')} required autoComplete="email" />
          </Field>
          <Field label="Senha" htmlFor="l-pass" hint={needsSetup ? 'Mínimo de 8 caracteres.' : null}>
            <input
              id="l-pass"
              type="password"
              className="input"
              value={form.password}
              onChange={set('password')}
              required
              minLength={needsSetup ? 8 : undefined}
              autoComplete={needsSetup ? 'new-password' : 'current-password'}
            />
          </Field>
          {!needsSetup && <Turnstile onToken={setToken} resetKey={resetKey} />}
          <button type="submit" className="btn-primary w-full py-2.5" disabled={busy || (!needsSetup && TURNSTILE_SITE_KEY && !token)}>
            {busy && <Spinner />}
            {needsSetup ? 'Criar acesso e entrar' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
