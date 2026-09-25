// Recalcula os campos "resumo" guardados direto na tabela clients.
// Sempre lê a fonte (a tabela de otimizações) em vez de confiar no valor que
// quem chamou mandou: assim editar a data de uma otimização antiga ou apagar
// a mais recente deixa o resumo certo sozinho.
import { getDb, unwrap } from './db.js'

export async function recalcLastOptimization(clientIds) {
  const ids = [...new Set([].concat(clientIds).filter(Boolean))]
  if (!ids.length) return
  const db = getDb()
  // Uma consulta pra todos os clientes afetados, pegando a mais recente de cada um.
  const rows = unwrap(
    await db.from('optimizations').select('client_id,performed_at').in('client_id', ids).order('performed_at', { ascending: false }),
  )
  const latest = new Map()
  for (const r of rows) if (!latest.has(r.client_id)) latest.set(r.client_id, r.performed_at)
  for (const id of ids) {
    unwrap(await db.from('clients').update({ last_optimization_at: latest.get(id) ?? null }).eq('id', id))
  }
}
