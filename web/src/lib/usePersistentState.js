import { useEffect, useState } from 'react'

// useState que lembra o valor no navegador (ex: filtro escolhido em cada tela).
// É só conveniência: se o localStorage estiver bloqueado, funciona sem lembrar.
export function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw != null ? JSON.parse(raw) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* navegador sem storage: segue sem lembrar */
    }
  }, [key, value])
  return [value, setValue]
}
