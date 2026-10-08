// Checklist de onboarding do cliente: o passo a passo que a Pipe segue do
// "fechou" até a primeira campanha rodando com rastreamento conferido. Os
// itens dependem dos serviços contratados (sem Google Ads, sem item de Google).
// Pra mudar o processo da agência, é só mexer nesta lista.

// `only`: o item só entra se o cliente tiver pelo menos um desses serviços.
export const ONBOARDING_TEMPLATE = [
  {
    section: 'Contrato e boas-vindas',
    items: [
      { title: 'Honorário, início do contrato e dia de cobrança na ficha', hint: 'Editar cliente → Contrato. Alimenta os Números da agência.' },
      { title: 'Contato que decide cadastrado (WhatsApp e e-mail)', hint: 'Card Contatos da ficha.' },
      { title: 'Grupo de WhatsApp com o cliente criado', hint: 'Nome padrão: "Pipe × Nome do cliente".' },
      { title: 'Reunião de kickoff feita e registrada na linha do tempo', hint: 'Registrar contato → Reunião, com os combinados.' },
    ],
  },
  {
    section: 'Acessos',
    items: [
      { title: 'Pipe como parceira na BM do cliente (conta de anúncios, página, Instagram e pixel)', hint: 'Sem parceria o monitor de saldo não lê a conta.', only: ['meta_ads', 'dados'] },
      { title: 'Conta do Google Ads vinculada à MCC da Pipe', only: ['google_ads'] },
      { title: 'Acesso de publicação no Google Tag Manager', only: ['dados', 'google_ads', 'meta_ads'] },
      { title: 'Acesso ao site (WordPress/hospedagem) ou ao domínio', only: ['paginas', 'dados'] },
      { title: 'Forma de pagamento da conta definida (cartão ou Pix pré-pago) e saldo mínimo combinado', hint: 'Pré-pago: definir quem recarrega e com que antecedência.', only: ['meta_ads', 'google_ads'] },
      { title: 'IDs das contas (Meta e Google) cadastrados na ficha', hint: 'Editar cliente → Contas de anúncio.', only: ['meta_ads', 'google_ads'] },
    ],
  },
  {
    section: 'Estratégia',
    items: [
      { title: 'Briefing preenchido (oferta, público, diferenciais, tom e regras)', hint: 'Card Briefing da ficha. As regras aparecem em destaque pra toda a equipe.' },
      { title: 'Meta de custo por resultado e volume definidos com o cliente', hint: 'Campo "Meta de custo por resultado" no briefing: vira recomendação nas campanhas.' },
      { title: 'Verba de mídia mensal e divisão entre canais definidas' },
      { title: 'Concorrentes mapeados na Biblioteca de Anúncios', only: ['meta_ads', 'criativos'] },
    ],
  },
  {
    section: 'Rastreamento',
    items: [
      { title: 'Pixel + API de Conversões funcionando (evento de teste recebido)', only: ['meta_ads', 'dados'] },
      { title: 'Conversão do Google Ads medindo o contato real (não qualquer clique)', hint: 'Armadilha comum: conversão disparando em todo botão do site.', only: ['google_ads', 'dados'] },
      { title: 'Tags do GTM revisadas e publicadas', only: ['dados', 'google_ads', 'meta_ads'] },
      { title: 'UTMs padrão nos links dos anúncios', only: ['meta_ads', 'google_ads'] },
    ],
  },
  {
    section: 'Produção',
    items: [
      { title: 'Primeira leva de criativos aprovada pelo cliente', only: ['meta_ads', 'google_ads', 'criativos'] },
      { title: 'Página de destino no ar e testada (celular, formulário, WhatsApp)', only: ['paginas'] },
      { title: 'Automação / agente de IA configurado e testado ponta a ponta', only: ['automacao'] },
      { title: 'Copy revisada com as regras do cliente', hint: 'Ex.: saúde exige CRO e proíbe "avaliação gratuita".', only: ['meta_ads', 'google_ads', 'criativos', 'paginas'] },
    ],
  },
  {
    section: 'Lançamento',
    items: [
      { title: 'Campanhas no ar com a nomenclatura padrão', hint: 'Manual da Pipe → Padrões de nomes.', only: ['meta_ads', 'google_ads'] },
      { title: 'Checagem de 48h: entrega, custo e conversões chegando', only: ['meta_ads', 'google_ads'] },
      { title: 'Dia da otimização semanal e dia do relatório definidos na ficha', hint: 'Briefing → Cadência. Entram sozinhos na agenda do Hoje.' },
      { title: 'Primeiro relatório combinado com o cliente (data e formato)' },
    ],
  },
]

// Itens do checklist pra um cliente com estes serviços. Sem serviço marcado,
// entra tudo (melhor sobrar item do que esquecer um passo).
export function buildOnboardingItems(services = []) {
  const has = (only) => !only || !services.length || only.some((s) => services.includes(s))
  const rows = []
  let position = 0
  for (const { section, items } of ONBOARDING_TEMPLATE) {
    for (const item of items) {
      if (!has(item.only)) continue
      rows.push({ kind: 'onboarding', section, title: item.title, hint: item.hint || null, position: position++ })
    }
  }
  return rows
}
