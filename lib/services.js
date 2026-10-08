// O que a Pipe vende: o pipeline inteiro (mídia, páginas, IA/automação e dados).
// Cada cliente marca os serviços contratados; o checklist de onboarding e as
// oportunidades de expansão saem daqui. A tela tem a mesma lista em
// web/src/lib/constants.js (SERVICES).
export const SERVICES = {
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  paginas: 'Páginas e sites',
  automacao: 'IA e automação',
  dados: 'Rastreamento e dados',
  criativos: 'Criativos',
}
export const SERVICE_KEYS = Object.keys(SERVICES)

export function cleanServices(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(String))].filter((s) => SERVICE_KEYS.includes(s))
}

// Campos do briefing do cliente (texto livre, curto). "regras" aparece em
// destaque na ficha: é o que ninguém da equipe pode esquecer (ex: CRO na copy).
export const BRIEFING_KEYS = ['objetivo', 'oferta', 'publico', 'diferenciais', 'tom', 'regras', 'concorrentes', 'observacoes']

export function cleanBriefing(value) {
  const out = {}
  if (!value || typeof value !== 'object') return out
  for (const key of BRIEFING_KEYS) {
    const v = typeof value[key] === 'string' ? value[key].trim().slice(0, 2000) : ''
    if (v) out[key] = v
  }
  return out
}
