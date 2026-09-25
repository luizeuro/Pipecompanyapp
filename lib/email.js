// Envio de e-mail via Resend (https://resend.com, plano gratuito).
// Sem RESEND_API_KEY/ALERT_EMAIL_FROM/ALERT_EMAIL_TO o envio só é pulado.
import { escapeHtml, httpError } from './util.js'

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.ALERT_EMAIL_FROM && process.env.ALERT_EMAIL_TO)
}

export function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '')
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  return 'http://localhost:5180'
}

export async function sendEmail({ subject, html }) {
  if (!emailConfigured()) throw httpError(400, 'E-mail não configurado: defina RESEND_API_KEY, ALERT_EMAIL_FROM e ALERT_EMAIL_TO.')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.ALERT_EMAIL_FROM,
      to: process.env.ALERT_EMAIL_TO.split(',').map((s) => s.trim()).filter(Boolean),
      subject,
      html,
    }),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw httpError(502, `Resend recusou o envio: ${body.message || res.status}`)
  }
  return res.json()
}

const SEVERITY = {
  critical: { label: 'Crítico', color: '#b91c1c', bg: '#fef2f2' },
  warning: { label: 'Atenção', color: '#b45309', bg: '#fffbeb' },
  info: { label: 'Info', color: '#475569', bg: '#f1f5f9' },
}

// HTML simples, com estilo inline (cliente de e-mail ignora <style>), nas
// cores da Pipe: azul-marinho #1A2332 e cinzas da proposta comercial.
export function renderAlertsEmail({ title, intro, alerts, clientsById, extraSections = [] }) {
  const url = appUrl()
  const rows = alerts
    .map((a) => {
      const sev = SEVERITY[a.severity] || SEVERITY.info
      const client = clientsById.get(a.client_id)
      return `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;white-space:nowrap">
          <span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700;color:${sev.color};background:${sev.bg}">${sev.label}</span>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top">
          <a href="${url}/clientes/${escapeHtml(a.client_id)}" style="color:#1a2332;font-weight:700;text-decoration:none">${escapeHtml(client?.name || 'Cliente')}</a>
          <div style="color:#5f6e84;font-size:14px;margin-top:2px">${escapeHtml(a.message)}</div>
        </td>
      </tr>`
    })
    .join('')

  const extras = extraSections
    .filter((s) => s.items.length)
    .map(
      (s) => `<h3 style="font-size:15px;color:#1a2332;margin:28px 0 8px">${escapeHtml(s.title)}</h3>
      <ul style="margin:0;padding-left:18px;color:#5f6e84;font-size:14px;line-height:1.6">
        ${s.items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}
      </ul>`,
    )
    .join('')

  return `<!doctype html><html><body style="margin:0;background:#f7f8fa;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:24px">
    <div style="background:#1a2332;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0">
      <div style="font-size:12px;letter-spacing:3px;font-weight:700;color:#c7d2df">PIPE COMPANY · MONITOR</div>
      <div style="font-size:20px;font-weight:700;margin-top:6px">${escapeHtml(title)}</div>
    </div>
    <div style="background:#fff;border:1px solid #e2e8f0;border-top:0;padding:20px 22px;border-radius:0 0 12px 12px">
      <p style="color:#5f6e84;font-size:14px;margin:0 0 14px">${escapeHtml(intro)}</p>
      ${alerts.length ? `<table style="width:100%;border-collapse:collapse">${rows}</table>` : ''}
      ${extras}
      <p style="margin:24px 0 0"><a href="${url}" style="display:inline-block;background:#1a2332;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:700;font-size:14px">Abrir o painel</a></p>
    </div>
  </div></body></html>`
}
