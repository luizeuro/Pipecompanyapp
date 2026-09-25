// Utilitários pequenos do backend, sem dependência externa.

// Erro com status HTTP, pra rota só dar `throw` e o handler central responder.
export function httpError(status, message, code) {
  const err = new Error(message)
  err.status = status
  if (code) err.code = code
  return err
}

// Roda `fn` em cada item com no máximo `limit` chamadas ao mesmo tempo.
// Por quê: consultar 50 contas de uma vez estoura o limite de requisições da
// Meta/Google; uma de cada vez deixa a checagem lenta demais pra serverless.
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker)
  await Promise.all(workers)
  return results
}

// Converte texto de dinheiro em número. Aceita "R$ 1.234,56" (pt-BR) e
// "R$1,234.56" (en-US), porque a Meta devolve no idioma do usuário do token.
export function parseMoney(text) {
  if (!text) return null
  const match = String(text).match(/-?\d[\d.,]*/)
  if (!match) return null
  let s = match[0].replace(/[.,]+$/, '')
  const hasComma = s.includes(',')
  const hasDot = s.includes('.')
  if (hasComma && hasDot) {
    // O separador que aparece por último é o decimal.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (hasComma || hasDot) {
    const sep = hasComma ? ',' : '.'
    const parts = s.split(sep)
    // "1.234" ou "1,234,567": separador de milhar. "12,50": decimal.
    const isThousands = parts.length > 2 || parts[parts.length - 1].length === 3
    s = isThousands ? parts.join('') : parts.join('.')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

// Data AAAA-MM-DD num fuso específico ('en-CA' já formata nesse padrão).
export function dateInTz(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

// Minutos desde a meia-noite num fuso específico (pra comparar com CHECK_HOUR).
export function minutesInTz(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return get('hour') * 60 + get('minute')
}

// Soma dias a uma data AAAA-MM-DD sem cair em armadilha de fuso/horário de verão.
export function shiftDate(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function round(n, digits = 2) {
  if (n == null || !Number.isFinite(n)) return null
  const f = 10 ** digits
  return Math.round(n * f) / f
}

export function cleanText(value, max = 500) {
  if (value == null) return null
  const s = String(value).trim()
  return s ? s.slice(0, max) : null
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Por padrão os testes locais e a produção ficam separados: na Vercel (ou com
// NODE_ENV=production) nada de banco em memória nem segredo de desenvolvimento.
export function isProduction() {
  return Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production'
}
