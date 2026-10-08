// Mensagens prontas de WhatsApp pro cliente (botão "Mensagem" na ficha).
// O texto sai preenchido com nome, saldo e valor sugerido; a pessoa revisa
// antes de enviar. Pra mudar o tom da agência, é só mexer aqui.
import { money } from './format.js'

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const PLATFORM_NAME = { meta: 'Meta (Facebook/Instagram)', google: 'Google Ads' }

// Recarga sugerida: o que falta pra cobrir ~15 dias no ritmo atual, arredondado pra cima de R$ 50.
export function suggestedRecharge(snapshot, days = 15) {
  if (!snapshot?.ok || !snapshot.avg_daily_spend) return null
  const need = snapshot.avg_daily_spend * days - Number(snapshot.balance || 0)
  return need > 0 ? Math.ceil(need / 50) * 50 : null
}

// A conta que mais precisa de recarga (menos dias de saldo).
function lowestBalance(client) {
  const list = [
    ['meta', client.meta_snapshot],
    ['google', client.google_snapshot],
  ].filter(([, s]) => s?.ok && s.balance != null)
  list.sort((a, b) => (a[1].days_left ?? Infinity) - (b[1].days_left ?? Infinity))
  return list[0] || null
}

export const MESSAGE_TEMPLATES = [
  {
    id: 'recarga',
    label: 'Recarga de saldo',
    kind: 'whatsapp',
    build: ({ firstName, client }) => {
      const low = lowestBalance(client)
      if (!low) {
        return `Oi ${firstName}! Tudo bem? Passando pra lembrar da recarga da conta de anúncios, pra não pausar as campanhas. Quer que eu te mande o passo a passo?`
      }
      const [platform, s] = low
      const days = s.days_left != null ? (s.days_left < 1 ? 'menos de 1 dia' : `cerca de ${Math.round(s.days_left)} dia(s)`) : null
      const suggestion = suggestedRecharge(s)
      return [
        `Oi ${firstName}! Tudo bem? 😊`,
        `O saldo da conta de anúncios do ${PLATFORM_NAME[platform]} está em ${money(s.balance)}${days ? ` e, no ritmo atual, dura ${days}` : ''}.`,
        suggestion
          ? `Pra não pausar os anúncios, sugerimos uma recarga de ${money(suggestion)} (cobre uns 15 dias).`
          : 'Pra não pausar os anúncios, vale fazer uma recarga.',
        'Pode ser por Pix ou boleto direto no gerenciador. Se quiser, te mando o passo a passo!',
      ].join('\n\n')
    },
  },
  {
    id: 'relatorio',
    label: 'Relatório do mês',
    kind: 'report',
    build: ({ firstName }) => {
      const d = new Date()
      d.setMonth(d.getMonth() - 1)
      return [
        `Oi ${firstName}! Seu relatório de ${MONTHS[d.getMonth()]} está pronto: [link do relatório]`,
        'Principais pontos:\n• [resultado principal]\n• [o que melhorou]\n• [próximo passo]',
        'Quer marcar 15 minutos essa semana pra gente conversar sobre o plano do mês?',
      ].join('\n\n')
    },
  },
  {
    id: 'material',
    label: 'Pedido de material',
    kind: 'whatsapp',
    build: ({ firstName }) =>
      `Oi ${firstName}! Pra próxima leva de anúncios, você consegue enviar fotos e vídeos de [produto/serviço] até [data]? Vídeo curto na vertical, gravado no celular, funciona muito bem. 🎬`,
  },
  {
    id: 'aprovacao',
    label: 'Aprovação de criativos',
    kind: 'whatsapp',
    build: ({ firstName }) =>
      `Oi ${firstName}! Seguem os criativos da semana pra sua aprovação: [link]\n\nSe estiver tudo certo, subimos ainda hoje. Qualquer ajuste, é só me falar!`,
  },
  {
    id: 'honorario',
    label: 'Lembrete de honorário',
    kind: 'whatsapp',
    build: ({ firstName, client }) => {
      const d = new Date()
      return `Oi ${firstName}! Passando pra lembrar que o honorário de ${MONTHS[d.getMonth()]}${
        client.fee_monthly ? ` (${money(client.fee_monthly)})` : ''
      } vence${client.billing_day ? ` dia ${client.billing_day}` : ' em breve'}. Qualquer dúvida, estou à disposição!`
    },
  },
]
