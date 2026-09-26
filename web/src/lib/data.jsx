// Dados compartilhados entre as páginas: lista de clientes, alertas abertos,
// equipe e a agenda do dia (follow-ups, próximos passos do funil, pendências).
// Carrega uma vez e cada página chama `refresh()` depois de alterar algo, em
// vez de cada tela buscar a mesma lista por conta própria.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from './api.js'

const DataContext = createContext(null)

export function DataProvider({ children }) {
  const [clients, setClients] = useState([])
  const [alerts, setAlerts] = useState([])
  const [users, setUsers] = useState([])
  const [lastCheck, setLastCheck] = useState(null)
  const [today, setToday] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const [c, a, u, s, t] = await Promise.all([
        api('/clients'),
        api('/alerts?status=open'),
        api('/users'),
        api('/settings/status'),
        api('/today'),
      ])
      setClients(c.clients)
      setAlerts(a.alerts)
      setUsers(u.users)
      setLastCheck(s.last_check)
      setToday(t)
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

  // Quantos itens da agenda vencem hoje ou já venceram (número no menu "Hoje").
  const todayDueCount = useMemo(() => {
    if (!today) return 0
    const t = today.today
    return (
      today.followups.filter((f) => f.next_step_at <= t).length +
      today.leads.filter((l) => l.next_step_at && l.next_step_at <= t).length +
      today.pendencias.filter((p) => p.due_date <= t).length
    )
  }, [today])

  const value = useMemo(
    () => ({ clients, clientsById, alerts, users, lastCheck, today, todayDueCount, loading, error, refresh }),
    [clients, clientsById, alerts, users, lastCheck, today, todayDueCount, loading, error, refresh],
  )
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData precisa estar dentro de <DataProvider>')
  return ctx
}
