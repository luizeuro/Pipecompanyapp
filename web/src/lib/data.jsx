// Dados compartilhados entre as páginas: lista de clientes, alertas abertos e
// equipe. Carrega uma vez e cada página chama `refresh()` depois de alterar
// algo, em vez de cada tela buscar a mesma lista por conta própria.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from './api.js'

const DataContext = createContext(null)

export function DataProvider({ children }) {
  const [clients, setClients] = useState([])
  const [alerts, setAlerts] = useState([])
  const [users, setUsers] = useState([])
  const [lastCheck, setLastCheck] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const [c, a, u, s] = await Promise.all([
        api('/clients'),
        api('/alerts?status=open'),
        api('/users'),
        api('/settings/status'),
      ])
      setClients(c.clients)
      setAlerts(a.alerts)
      setUsers(u.users)
      setLastCheck(s.last_check)
      setError(null)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const clientsById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients])

  const value = useMemo(
    () => ({ clients, clientsById, alerts, users, lastCheck, loading, error, refresh }),
    [clients, clientsById, alerts, users, lastCheck, loading, error, refresh],
  )
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData precisa estar dentro de <DataProvider>')
  return ctx
}
