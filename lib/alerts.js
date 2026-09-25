// Sincronização dos alertas com a tabela `alerts`.
// Um alerta é identificado por (cliente, plataforma, tipo): enquanto a
// condição continuar, o mesmo alerta segue aberto (só atualiza a mensagem);
// quando ela some, o alerta é resolvido sozinho. Assim o e-mail só avisa o
// que é novo, sem repetir o mesmo problema a cada verificação.
import { unwrap } from './db.js'

export { evaluateAlerts, PLATFORM_LABEL } from './alertRules.js'

const alertKey = (a) => `${a.platform}:${a.type}`

// Sincroniza os alertas de UM cliente. `openAlerts` já vem carregado em lote
// pelo chamador (uma consulta pra todos os clientes, não uma por cliente).
// Devolve só os alertas recém-criados, que são os que vão pro e-mail.
export async function syncClientAlerts(db, client, evaluated, openAlerts = []) {
  const nowIso = new Date().toISOString()
  const openByKey = new Map(openAlerts.map((a) => [alertKey(a), a]))
  const wanted = new Map(evaluated.map((a) => [alertKey(a), a]))
  const toInsert = []

  for (const [key, alert] of wanted) {
    const existing = openByKey.get(key)
    if (!existing) {
      toInsert.push({ client_id: client.id, ...alert })
    } else if (existing.message !== alert.message || existing.severity !== alert.severity) {
      unwrap(
        await db
          .from('alerts')
          .update({ message: alert.message, severity: alert.severity, updated_at: nowIso })
          .eq('id', existing.id),
      )
    }
  }

  const toResolve = [...openByKey.entries()].filter(([key]) => !wanted.has(key)).map(([, a]) => a.id)
  if (toResolve.length) {
    unwrap(
      await db
        .from('alerts')
        .update({ resolved_at: nowIso, resolved_by: 'automático', updated_at: nowIso })
        .in('id', toResolve),
    )
  }

  if (!toInsert.length) return []
  return unwrap(await db.from('alerts').insert(toInsert).select('*'))
}
