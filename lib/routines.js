// Cadência de cada cliente, calculada na hora (nada guardado, nada duplicado):
// - otimização semanal no dia da semana marcado na ficha; conta como feita
//   se houver otimização registrada a partir de 2 dias antes desse dia;
// - relatório mensal até o dia do mês marcado; conta como feito se houver
//   relatório publicado (ou "relatório enviado" na linha do tempo) no mês.
// O que não foi feito aparece na agenda do Hoje (atrasado, hoje ou próximos dias).
import { dateInTz, shiftDate } from './util.js'

const weekdayOf = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay()
const pad = (n) => String(n).padStart(2, '0')

function nextMonth(yyyyMm) {
  const [y, m] = yyyyMm.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`
}

export function computeRoutines(clients, { today, horizonDays = 7, reportedThisMonth = new Set(), timeZone = 'America/Sao_Paulo' }) {
  const horizon = shiftDate(today, horizonDays)
  const items = []
  for (const c of clients) {
    if (c.status !== 'active') continue

    if (c.optimization_weekday != null) {
      const back = (weekdayOf(today) - c.optimization_weekday + 7) % 7
      const lastOccurrence = shiftDate(today, -back)
      const lastDone = c.last_optimization_at ? dateInTz(new Date(c.last_optimization_at), timeZone) : null
      const doneThisCycle = Boolean(lastDone && lastDone >= shiftDate(lastOccurrence, -2))
      const date = doneThisCycle ? shiftDate(lastOccurrence, 7) : lastOccurrence
      if (date <= horizon) {
        items.push({ type: 'optimization', client_id: c.id, client_name: c.name, date, title: 'Otimização semanal', last_done: lastDone })
      }
    }

    if (c.report_day != null) {
      const month = today.slice(0, 7)
      const done = reportedThisMonth.has(c.id)
      const date = `${done ? nextMonth(month) : month}-${pad(c.report_day)}`
      if (date <= horizon) {
        items.push({ type: 'report', client_id: c.id, client_name: c.name, date, title: 'Relatório mensal' })
      }
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.client_name.localeCompare(b.client_name))
}
