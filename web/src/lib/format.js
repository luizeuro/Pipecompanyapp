// Formatação em pt-BR usada no app inteiro (dinheiro, datas, "há X dias").

const moneyFormatters = new Map()

export function money(value, currency = 'BRL') {
  if (value == null || Number.isNaN(Number(value))) return '—'
  const key = currency || 'BRL'
  if (!moneyFormatters.has(key)) {
    try {
      moneyFormatters.set(key, new Intl.NumberFormat('pt-BR', { style: 'currency', currency: key }))
    } catch {
      moneyFormatters.set(key, new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }))
    }
  }
  return moneyFormatters.get(key).format(Number(value))
}

// "R$ 12,3 mil" pros cartões de resumo, onde não cabe o valor inteiro.
export function moneyCompact(value) {
  if (value == null) return '—'
  const n = Number(value)
  // Abaixo de mil, "R$ 293" lê melhor que "R$ 292,9".
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: Math.abs(n) < 1000 ? 0 : 1,
  }).format(n)
}

export function number(value, digits = 0) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(Number(value))
}

export function plural(n, singular, pluralForm) {
  return `${number(n)} ${n === 1 ? singular : pluralForm || `${singular}s`}`
}

export function dateBR(value) {
  if (!value) return '—'
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function dateShort(value) {
  if (!value) return '—'
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
}

export function dateTimeBR(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// "agora", "há 5 min", "há 3 h", "ontem", "há 12 dias"
export function timeAgo(value) {
  if (!value) return 'nunca'
  const diff = Date.now() - new Date(value).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'ontem'
  return `há ${d} dias`
}

export function daysLabel(days) {
  if (days == null) return null
  if (days < 1) return 'menos de 1 dia'
  const n = Math.round(days)
  return `~${n} ${n === 1 ? 'dia' : 'dias'}`
}

// Data de hoje no formato do <input type="date"> (fuso do navegador).
export function todayInput() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function toDateInput(value) {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const d = new Date(value)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function formatGoogleId(digits) {
  if (!digits) return ''
  const s = String(digits)
  return s.length === 10 ? `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}` : s
}

// Busca sem acento e sem diferenciar maiúscula ("clinica" acha "Clínica").
export function normalizeSearch(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

// Monta o endereço de um link da ficha a partir do que foi digitado
// ("@perfil", "site.com.br" ou URL completa).
export function linkHref(key, value) {
  if (!value) return null
  const v = String(value).trim()
  if (/^https?:\/\//i.test(v)) return v
  if (key === 'instagram') return `https://instagram.com/${v.replace(/^@/, '').replace(/^instagram\.com\//i, '')}`
  return `https://${v}`
}

// Link de conversa no WhatsApp (assume Brasil quando vier sem o 55).
export function whatsappHref(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (digits.length < 10) return null
  return `https://wa.me/${digits.length <= 11 ? `55${digits}` : digits}`
}

// Dias até uma data AAAA-MM-DD (negativo = já passou), no fuso do navegador.
export function daysUntil(isoDate) {
  if (!isoDate) return null
  const target = new Date(`${String(isoDate).slice(0, 10)}T12:00:00`)
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  return Math.round((target - today) / 86400000)
}

// "hoje", "amanhã", "ontem", "em 3 dias", "há 2 dias" — pra prazos e follow-ups.
export function relativeDay(isoDate) {
  const d = daysUntil(isoDate)
  if (d == null) return ''
  if (d === 0) return 'hoje'
  if (d === 1) return 'amanhã'
  if (d === -1) return 'ontem'
  return d > 0 ? `em ${d} dias` : `há ${-d} dias`
}
