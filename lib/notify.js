// Decide o que mandar por e-mail depois de cada verificação automática:
// - uma vez por dia, na primeira execução a partir de CHECK_HOUR (no fuso
//   CHECK_TIMEZONE), vai o RESUMO DIÁRIO com todos os alertas abertos;
// - nas outras execuções, só vai e-mail se surgiu alerta NOVO.
// Assim a equipe recebe um panorama pela manhã e só é interrompida no resto
// do dia quando aparece problema novo.
import { getDb, unwrap } from './db.js'
import { emailConfigured, renderAlertsEmail, sendEmail } from './email.js'
import { dateInTz, minutesInTz } from './util.js'

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 }
const bySeverity = (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)

function digestDue(lastDigestDate, now = new Date()) {
  const tz = process.env.CHECK_TIMEZONE || 'America/Sao_Paulo'
  const [h, m] = String(process.env.CHECK_HOUR || '09:00').split(':').map(Number)
  const today = dateInTz(now, tz)
  const due = minutesInTz(now, tz) >= (h || 0) * 60 + (m || 0) && lastDigestDate !== today
  return { due, today }
}

export async function notifyAfterCheck(result) {
  if (!emailConfigured()) return { sent: false, reason: 'email_not_configured' }
  const db = getDb()

  const state = unwrap(await db.from('app_state').select('value').eq('key', 'last_digest').maybeSingle())
  const { due, today } = digestDue(state?.value?.date)

  const clients = unwrap(await db.from('clients').select('id,name,status,last_optimization_at'))
  const clientsById = new Map(clients.map((c) => [c.id, c]))
  const nowIso = new Date().toISOString()

  if (due) {
    const open = unwrap(await db.from('alerts').select('*').is('resolved_at', null)).sort(bySeverity)
    const stale = clients
      .filter((c) => c.status === 'active')
      .filter((c) => !c.last_optimization_at || Date.now() - new Date(c.last_optimization_at) >= 30 * 864e5)
      .map((c) =>
        c.last_optimization_at
          ? `${c.name}: última otimização há ${Math.floor((Date.now() - new Date(c.last_optimization_at)) / 864e5)} dias`
          : `${c.name}: nenhuma otimização registrada`,
      )
    await sendEmail({
      subject: open.length ? `Resumo do dia: ${open.length} alerta(s) aberto(s)` : 'Resumo do dia: tudo em ordem',
      html: renderAlertsEmail({
        title: 'Resumo diário das contas',
        intro: open.length
          ? `${open.length} alerta(s) aberto(s) depois da verificação de hoje.`
          : 'Nenhum alerta aberto nas contas monitoradas.',
        alerts: open,
        clientsById,
        extraSections: [{ title: 'Sem otimização há 30+ dias', items: stale }],
      }),
    })
    if (open.length) unwrap(await db.from('alerts').update({ emailed_at: nowIso }).in('id', open.map((a) => a.id)))
    unwrap(
      await db.from('app_state').upsert({ key: 'last_digest', value: { date: today, at: nowIso }, updated_at: nowIso }, { onConflict: 'key' }),
    )
    return { sent: true, kind: 'digest', alerts: open.length }
  }

  const fresh = result.newAlerts.filter((a) => a.severity !== 'info').sort(bySeverity)
  if (!fresh.length) return { sent: false, reason: 'no_new_alerts' }
  await sendEmail({
    subject: `${fresh.length} alerta(s) novo(s) nas contas de anúncio`,
    html: renderAlertsEmail({
      title: 'Alertas novos',
      intro: 'A verificação automática encontrou problemas novos:',
      alerts: fresh,
      clientsById,
    }),
  })
  unwrap(await db.from('alerts').update({ emailed_at: nowIso }).in('id', fresh.map((a) => a.id)))
  return { sent: true, kind: 'new_alerts', alerts: fresh.length }
}
