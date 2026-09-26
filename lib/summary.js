// Recalcula os campos "resumo" guardados direto na tabela clients.
// Sempre lê a fonte (otimizações, interações) em vez de confiar no valor que
// quem chamou mandou: assim editar a data de um registro antigo ou apagar o
// mais recente deixa o resumo certo sozinho.
import { getDb, unwrap } from './db.js'

// Busca o registro mais recente de cada cliente numa consulta só e grava no
// campo de resumo. `filter` restringe quais linhas contam (ex: nota interna
// não conta como contato com o cliente).
async function recalcLatest({ clientIds, table, dateColumn, target, filter }) {
  const ids = [...new Set([].concat(clientIds).filter(Boolean))]
  if (!ids.length) return
  const db = getDb()
  let query = db.from(table).select(`client_id,${dateColumn}`).in('client_id', ids)
  if (filter) query = filter(query)
  const rows = unwrap(await query.order(dateColumn, { ascending: false }))
  const latest = new Map()
  for (const r of rows) if (!latest.has(r.client_id)) latest.set(r.client_id, r[dateColumn])
  for (const id of ids) {
    unwrap(await db.from('clients').update({ [target]: latest.get(id) ?? null }).eq('id', id))
  }
}

export function recalcLastOptimization(clientIds) {
  return recalcLatest({ clientIds, table: 'optimizations', dateColumn: 'performed_at', target: 'last_optimization_at' })
}

// "Último contato" = última interação que não seja nota interna.
export function recalcLastContact(clientIds) {
  return recalcLatest({
    clientIds,
    table: 'interactions',
    dateColumn: 'happened_at',
    target: 'last_contact_at',
    filter: (q) => q.neq('kind', 'note'),
  })
}
