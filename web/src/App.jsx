// Raiz do app: descobre se há sessão, se o banco está configurado e se é o
// primeiro acesso; depois monta as rotas das telas logadas.
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { api, setUnauthorizedHandler } from './lib/api.js'
import { DataProvider } from './lib/data.jsx'
import Layout from './components/Layout.jsx'
import { ToastProvider } from './components/Toast.jsx'
import { Spinner } from './components/ui.jsx'
import Login from './pages/Login.jsx'
import SetupRequired from './pages/SetupRequired.jsx'
import Today from './pages/Today.jsx'

// Cada tela é carregada só quando é aberta (o app abre mais rápido; o Hoje,
// que é a primeira tela, vai junto no pacote principal).
const Funnel = lazy(() => import('./pages/Funnel.jsx'))
const Metrics = lazy(() => import('./pages/Metrics.jsx'))
const Reports = lazy(() => import('./pages/Reports.jsx'))
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'))
const Clients = lazy(() => import('./pages/Clients.jsx'))
const ClientDetail = lazy(() => import('./pages/ClientDetail.jsx'))
const Optimizations = lazy(() => import('./pages/Optimizations.jsx'))
const Pendencias = lazy(() => import('./pages/Pendencias.jsx'))
const Alerts = lazy(() => import('./pages/Alerts.jsx'))
const Settings = lazy(() => import('./pages/Settings.jsx'))
const Manual = lazy(() => import('./pages/Manual.jsx'))

const PageLoading = () => (
  <div className="flex justify-center py-20">
    <Spinner className="h-6 w-6 text-accent-400" />
  </div>
)

const SETUP_CODES = ['DB_NOT_CONFIGURED', 'DB_NOT_MIGRATED', 'DB_ACCESS_DENIED']

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
        <Spinner className="h-7 w-7 text-accent-400" />
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
              <Suspense fallback={<PageLoading />}>
              <Routes>
                <Route path="/" element={<Today />} />
                <Route path="/funil" element={<Funnel />} />
                <Route path="/numeros" element={<Metrics />} />
                <Route path="/relatorios" element={<Reports />} />
                <Route path="/contas" element={<Dashboard />} />
                <Route path="/clientes" element={<Clients />} />
                <Route path="/clientes/:id" element={<ClientDetail />} />
                <Route path="/otimizacoes" element={<Optimizations />} />
                <Route path="/pendencias" element={<Pendencias />} />
                <Route path="/alertas" element={<Alerts />} />
                <Route path="/configuracoes" element={<Settings user={state.user} />} />
                <Route path="/manual" element={<Manual user={state.user} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              </Suspense>
            </Layout>
          </DataProvider>
        </BrowserRouter>
      )}
    </ToastProvider>
  )
}
