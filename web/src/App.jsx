// Raiz do app: descobre se há sessão, se o banco está configurado e se é o
// primeiro acesso; depois monta as rotas das telas logadas.
import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { api, setUnauthorizedHandler } from './lib/api.js'
import { DataProvider } from './lib/data.jsx'
import Layout from './components/Layout.jsx'
import { ToastProvider } from './components/Toast.jsx'
import { Spinner } from './components/ui.jsx'
import Login from './pages/Login.jsx'
import SetupRequired from './pages/SetupRequired.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Clients from './pages/Clients.jsx'
import ClientDetail from './pages/ClientDetail.jsx'
import Optimizations from './pages/Optimizations.jsx'
import Pendencias from './pages/Pendencias.jsx'
import Alerts from './pages/Alerts.jsx'
import Settings from './pages/Settings.jsx'

const SETUP_CODES = ['DB_NOT_CONFIGURED', 'DB_NOT_MIGRATED']

export default function App() {
  const [state, setState] = useState({ loading: true })

  const boot = useCallback(async () => {
    try {
      const status = await api('/auth/status')
      if (status.needsSetup) return setState({ loading: false, needsSetup: true })
      try {
        const { user } = await api('/auth/me')
        setState({ loading: false, user })
      } catch {
        setState({ loading: false, user: null })
      }
    } catch (err) {
      setState({ loading: false, setupError: SETUP_CODES.includes(err.code) ? err : null, fatal: SETUP_CODES.includes(err.code) ? null : err })
    }
  }, [])

  useEffect(() => {
    boot()
    // Sessão expirou no meio do uso: volta pro login sem quebrar a tela.
    setUnauthorizedHandler(() => setState({ loading: false, user: null }))
  }, [boot])

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {})
    setState({ loading: false, user: null })
  }

  if (state.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-7 w-7 text-brand-400" />
      </div>
    )
  }
  if (state.setupError) return <SetupRequired code={state.setupError.code} message={state.setupError.message} />
  if (state.fatal) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-semibold">Não foi possível abrir o painel.</p>
        <p className="muted max-w-md text-sm">{state.fatal.message}</p>
        <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
          Tentar de novo
        </button>
      </div>
    )
  }

  return (
    <ToastProvider>
      {!state.user ? (
        <Login needsSetup={state.needsSetup} onLoggedIn={(user) => setState({ loading: false, user })} />
      ) : (
        <BrowserRouter>
          <DataProvider>
            <Layout user={state.user} onLogout={logout}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/clientes" element={<Clients />} />
                <Route path="/clientes/:id" element={<ClientDetail />} />
                <Route path="/otimizacoes" element={<Optimizations />} />
                <Route path="/pendencias" element={<Pendencias />} />
                <Route path="/alertas" element={<Alerts />} />
                <Route path="/configuracoes" element={<Settings user={state.user} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </DataProvider>
        </BrowserRouter>
      )}
    </ToastProvider>
  )
}
