// Orquestra a verificação das contas: consulta Meta/Google de cada cliente,
// guarda o histórico, atualiza o resumo na tabela `clients` e sincroniza os
// alertas. Usada pelo botão "Verificar agora" e pelo Cron da Vercel.
import { getDb, unwrap, dbMode } from './db.js'
import { decrypt } from './crypto.js'
import { fetchMetaSnapshot, metaConfigured } from './meta.js'
import { fetchGoogleSnapshot, googleConfigured } from './google.js'
import { fakeSnapshot } from './devFakeAds.js'
import { evaluateAlerts, syncClientAlerts } from './alerts.js'
import { mapLimit } from './util.js'

const CLIENT_COLUMNS =
  'id,name,status,meta_ad_account_id,meta_access_token_enc,google_ads_customer_id,result_metric,balance_alert_threshold,meta_snapshot,google_snapshot'

const notConfigured = (platform, message) => ({
  platform,
  ok: false,
  checked_at: new Date().toISOString(),
  error: message,
  error_code: 'not_configured',
})

// Sem banco real e sem credencial: estamos no ambiente local de demonstração.
const useFakeAds = () => dbMode() === 'memory'

async function checkMeta(client) {
  if (!client.meta_ad_account_id) return null
  let token = process.env.META_SYSTEM_USER_TOKEN || null
  if (client.meta_access_token_enc) {
    try {
      token = decrypt(client.meta_access_token_enc)
    } catch {
      return { ...notConfigured('meta', 'Não foi possível ler o token salvo do cliente (ENCRYPTION_KEY mudou?).'), error_code: 'api_error' }
    }
  }
  if (!token) {
    if (useFakeAds()) return fakeSnapshot('meta', client)
    return notConfigured('meta', 'Integração Meta não configurada (falta META_SYSTEM_USER_TOKEN).')
  }
  return fetchMetaSnapshot({ accountId: client.meta_ad_account_id, token, resultMetric: client.result_metric })
}

async function checkGoogle(client) {
  if (!client.google_ads_customer_id) return null
  if (!googleConfigured()) {
    if (useFakeAds()) return fakeSnapshot('google', client)
    return notConfigured('google', 'Integração Google Ads não configurada (faltam as variáveis GOOGLE_ADS_*).')
  }
  return fetchGoogleSnapshot({ customerId: client.google_ads_customer_id })
}

function historyRow(clientId, s) {
  return {
    client_id: clientId,
    platform: s.platform,
    checked_at: s.checked_at,
    ok: s.ok,
    balance: s.ok ? s.balance : null,
    spend_today: s.ok ? s.spend_today : null,
    spend_yesterday: s.ok ? s.spend_yesterday : null,
    spend_7d: s.ok ? s.spend_7d : null,
    results_7d: s.ok ? s.results_7d : null,
    active_campaigns: s.ok ? s.active_campaigns : null,
    data: s,
  }
}

// clientIds: verifica só esses (botão do cliente). Sem isso: todos os ativos.
export async function runChecks({ clientIds = null, trigger = 'manual' } = {}) {
  const db = getDb()
  const startedAt = new Date()
  let query = db.from('clients').select(CLIENT_COLUMNS)
  query = clientIds ? query.in('id', clientIds) : query.eq('status', 'active')
  const clients = unwrap(await query)

  // Alertas abertos de todos os clientes numa consulta só (nada de loop de SELECT).
  const openAlerts = clients.length
    ? unwrap(
        await db
          .from('alerts')
          .select('*')
          .in(
            'client_id',
            clients.map((c) => c.id),
          )
          .is('resolved_at', null),
      )
    : []
  const openByClient = new Map()
  for (const a of openAlerts) {
    if (!openByClient.has(a.client_id)) openByClient.set(a.client_id, [])
    openByClient.get(a.client_id).push(a)
  }

  const history = []
  const newAlerts = []
  let errors = 0

  await mapLimit(clients, 4, async (client) => {
    const [meta, google] = await Promise.all([checkMeta(client), checkGoogle(client)])
    const nowIso = new Date().toISOString()
    const updated = { ...client, meta_snapshot: meta, google_snapshot: google }

    for (const s of [meta, google]) {
      if (!s) continue
      if (s.error_code === 'not_configured') continue
      if (!s.ok) errors++
      history.push(historyRow(client.id, s))
    }

    unwrap(
      await db
        .from('clients')
        .update({ meta_snapshot: meta, google_snapshot: google, last_check_at: nowIso })
        .eq('id', client.id),
    )

    const created = await syncClientAlerts(db, client, evaluateAlerts(updated), openByClient.get(client.id))
    newAlerts.push(...created)
  })

  if (history.length) unwrap(await db.from('account_snapshots').insert(history))

  const summary = {
    at: startedAt.toISOString(),
    trigger,
    checked: clients.length,
    errors,
    new_alerts: newAlerts.length,
    duration_ms: Date.now() - startedAt.getTime(),
  }
  // Só a verificação geral conta como "última verificação" do painel.
  if (!clientIds) {
    unwrap(
      await db
        .from('app_state')
        .upsert({ key: 'last_check', value: summary, updated_at: new Date().toISOString() }, { onConflict: 'key' }),
    )
  }
  return { ...summary, newAlerts }
}

// Histórico com mais de 90 dias não aparece em tela nenhuma; apaga pra o banco
// gratuito do Supabase não encher.
export async function pruneHistory(days = 90) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  unwrap(await getDb().from('account_snapshots').delete().lt('checked_at', cutoff))
}

export function integrationsStatus() {
  return { meta: metaConfigured(), google: googleConfigured() }
}
