// Manual da Pipe: como a agência trabalha, em capítulos curtos. É o material
// de onboarding de quem entra na equipe e a referência do dia a dia.
// O texto padrão mora aqui (versionado com o código); quando alguém edita pela
// tela, a versão editada vai pra tabela `playbooks` e passa a valer no lugar.
// Nada de senha ou chave aqui: o manual diz ONDE pedir acesso, nunca o acesso.

export const PLAYBOOK_GROUPS = [
  { id: 'comece', label: 'Comece aqui' },
  { id: 'operacao', label: 'Operação' },
  { id: 'padroes', label: 'Padrões' },
  { id: 'ferramentas', label: 'Ferramentas' },
]

export const DEFAULT_PLAYBOOKS = [
  {
    slug: 'bem-vindo',
    group: 'comece',
    title: 'Bem-vindo à Pipe',
    summary: 'Quem somos, o que vendemos e como usar este sistema na primeira semana.',
    content: `## Quem somos

A **Pipe Company** monta e opera o **sistema de aquisição** dos clientes: o pipeline de vendas inteiro, do anúncio até a conversa que vira venda. Atendemos empresas do **Brasil todo**.

Não somos "agência de tráfego pago". O que entregamos tem quatro pilares:

1. **Mídia** — Meta Ads e Google Ads com gestão diária.
2. **Páginas** — landing pages, sites e páginas de captura (ex.: grupo VIP no WhatsApp).
3. **IA e automação** — agentes de atendimento no WhatsApp, aviso de lead, follow-up e CRM (n8n).
4. **Dados** — pixel, API de Conversões, GTM, conversões do Google, monitor de contas e relatórios.

## Como o Sistema Pipe se organiza

| Tela | Para quê |
|---|---|
| **Hoje** | Sua agenda: follow-ups, tarefas, otimizações e relatórios que vencem, clientes em risco. Comece o dia aqui. |
| **Clientes** | Ficha de cada cliente: contrato, briefing e regras, onboarding, contas, campanhas, linha do tempo. |
| **Contas** | Saldo, gasto e resultado de todas as contas de anúncio. Aviso quando o saldo pode acabar. |
| **Tarefas** | Tudo que precisa ser feito, por cliente e responsável. |
| **Funil** | Leads e propostas até o "Fechou!". |
| **Relatórios** | Relatórios e análises (da equipe e do Hermes, nosso agente de IA). |
| **Números** | Receita recorrente, saúde da carteira, funil e oportunidades de expansão. |
| **Manual** | Este manual. |

## Sua primeira semana

- [ ] Ler este manual inteiro (30 min) — principalmente **Jornada do cliente** e **Rotina da semana**.
- [ ] Pedir seus acessos (ver **Ferramentas e acessos**).
- [ ] Abrir a ficha de 3 clientes e ler briefing, regras e linha do tempo.
- [ ] Acompanhar uma otimização semanal com alguém da equipe e registrar no sistema.
- [ ] Montar um relatório mensal com a skill de relatório, revisado por alguém da equipe.

> Regra de ouro: **se não está no sistema, não aconteceu.** Conversa com cliente, otimização e combinado vão para a ficha.`,
  },
  {
    slug: 'servicos',
    group: 'comece',
    title: 'Nossas soluções',
    summary: 'O que entregamos em cada pilar e os sinais de que um cliente precisa de mais.',
    content: `## Mídia (Meta Ads e Google Ads)

**Entregamos:** estrutura de campanhas, públicos, criativos em teste contínuo, otimização semanal, controle de verba e saldo.
**Indicadores:** custo por resultado (conversa, cadastro ou compra), volume, frequência, retorno sobre o investimento.

## Páginas e sites

**Entregamos:** landing pages de objetivo único, sites institucionais, páginas de grupo VIP do WhatsApp — rápidas, no celular e com rastreamento instalado.
**Sinal de que o cliente precisa:** anúncio leva pro Instagram ou pra uma página lenta; CTR alto e conversão baixa.

## IA e automação

**Entregamos:** secretária de IA no WhatsApp (agendamento, qualificação, negociação), aviso de lead para a equipe do cliente, follow-up automático, CRM simples.
**Sinal de que o cliente precisa:** muitos leads e pouca resposta; o cliente demora a atender; leads se perdem no WhatsApp.

## Rastreamento e dados

**Entregamos:** pixel + API de Conversões, GTM, conversões do Google medindo o contato real, UTMs, monitor diário das contas e relatório mensal.
**Sinal de que o cliente precisa:** "não sei quantas vendas vieram do anúncio"; conversão contando clique de navegação; pixel sem eventos.

## Expansão (upsell)

A tela **Números → Oportunidades de expansão** mostra quem tem mídia sem rastreamento, sem página própria ou sem automação. Use isso na reunião mensal: a próxima solução do cliente é a que resolve o gargalo que o relatório mostrou.`,
  },
  {
    slug: 'jornada-cliente',
    group: 'operacao',
    title: 'Jornada do cliente',
    summary: 'Do primeiro contato à renovação: etapas, responsável e onde cada coisa fica no sistema.',
    content: `## As 8 etapas

| # | Etapa | O que acontece | Onde no sistema | Pronto quando |
|---|---|---|---|---|
| 1 | **Prospecção** | Lead chega (indicação, Instagram, site) | Funil → novo lead | Lead com próximo passo e data |
| 2 | **Diagnóstico e proposta** | Pesquisa do negócio, mercado e concorrência; deck com a skill *proposta-comercial-pipe* | Funil → etapa Proposta (link da proposta no lead) | Proposta enviada e retorno agendado |
| 3 | **Fechamento** | Contrato assinado | Funil → **Fechou!** (cria o cliente com histórico) | Cliente criado, contrato na ficha |
| 4 | **Onboarding** | Acessos, briefing, metas, rastreamento | Ficha → **Onboarding** (checklist) | Checklist 100% |
| 5 | **Lançamento** | Campanhas, página e automações no ar | Ficha → Campanhas | Checagem de 48h feita |
| 6 | **Operação** | Otimização semanal, saldo, tarefas | Hoje + Contas + Otimizações | Toda semana com otimização registrada |
| 7 | **Relatório mensal** | Resultado, aprendizados e plano | Relatórios (skill *relatorio-performance-pipe*) | Enviado e registrado na linha do tempo |
| 8 | **Renovação e expansão** | Reunião de resultado, próxima solução | Ficha → Contrato (renovação) + Números | Renovado ou expansão proposta |

## Regras da jornada

- **Ninguém lança campanha sem onboarding** de acessos e rastreamento: anúncio sem medição é dinheiro sem aprendizado.
- **Todo cliente tem um responsável** (campo na ficha). O responsável responde pela saúde do cliente.
- **Saúde abaixo de 50** (Em risco) = conversa com o cliente nesta semana.`,
  },
  {
    slug: 'rotina-semanal',
    group: 'operacao',
    title: 'Rotina da semana',
    summary: 'O ritmo da agência: o que fazer todo dia, toda semana e todo mês.',
    content: `## Todo dia (primeiros 30 minutos)

1. Abrir **Hoje**: atrasados primeiro, depois o que vence hoje.
2. Ver **saldo acabando** e **alertas**. Saldo crítico = mensagem de recarga pro cliente na hora (botão **Mensagem** na ficha).
3. Responder clientes e registrar as conversas importantes na linha do tempo.

## Toda semana

- **No dia de otimização de cada cliente** (definido na ficha): abrir a aba **Campanhas**, ler as recomendações, otimizar e **registrar a otimização**.
- **Segunda-feira:** revisão do funil (próximos passos de todos os leads) e das tarefas atrasadas.
- **Sexta-feira:** olhar a saúde da carteira em **Clientes** e marcar contato com quem está em atenção.

## Todo mês

- **Até o dia do relatório de cada cliente:** relatório mensal publicado e enviado (vira item no Hoje quando vence).
- **Dia 1 a 5:** conferir honorários e cobranças (Hoje mostra cobranças da semana).
- **Reunião interna:** Números da agência — receita, saúde, funil, cancelamentos e oportunidades de expansão.

## A cada 3 meses

- **Raio-X das contas:** auditoria de todas as contas com gasto (estrutura, público, criativos, rastreamento).`,
  },
  {
    slug: 'otimizacao',
    group: 'operacao',
    title: 'Como otimizamos',
    summary: 'O checklist da otimização semanal e as regras para não atrapalhar o aprendizado.',
    content: `## O que olhar (nesta ordem)

1. **Entrega:** campanha ativa sem gasto? orçamento total acabando? conta com pagamento pendente?
2. **Custo por resultado vs. meta do cliente** e vs. a semana anterior (aba Campanhas mostra a seta).
3. **Frequência:** acima de 4 na semana = público saturando.
4. **Criativos:** um anúncio levando quase toda a verba? CTR caindo? Subir variações antes de ele cansar.
5. **Estrutura:** conjuntos de R$ 10–16/dia não saem do aprendizado — concentrar verba.
6. **Público e posicionamento:** só Instagram encarece o CPM 2 a 5×; Advantage+ desligado e público estreito saturam rápido.
7. **Rastreamento:** os resultados ainda estão chegando? (conversão zerada do nada = problema de medição).

## Regras

- **Mexa em um dia só por semana.** Cada edição significativa reinicia o aprendizado.
- **Escalar:** no máximo +20% de verba a cada 3–4 dias.
- **Teste com hipótese:** "trocar o gancho do criativo porque o CTR caiu 40%", não "mudar por mudar".
- **Registrar sempre** em *Registrar otimização*: categoria, o que foi feito e por quê. Isso alimenta a saúde do cliente e o relatório.`,
  },
  {
    slug: 'rastreamento',
    group: 'padroes',
    title: 'Padrão de rastreamento',
    summary: 'Pixel, API de Conversões, GTM e as armadilhas que já pegamos em clientes.',
    content: `## O mínimo de todo cliente

- **Meta:** pixel + API de Conversões, evento principal configurado (Lead, Purchase ou conversa), testado com **Eventos de teste**.
- **Google:** conversão medindo o **contato real** (formulário enviado, clique no WhatsApp/telefone), importada no Google Ads.
- **GTM:** um container por site, tags com nome padrão, publicado com descrição da versão.
- **UTMs** em todo link de anúncio.

## Armadilhas que já aconteceram

| Problema | Sintoma | Como evitar |
|---|---|---|
| Conversão disparando em **qualquer botão** | Muitos "contatos" e poucas conversas reais | Gatilho só no clique de WhatsApp/telefone ou no envio do formulário |
| Botão da LP vai pra um **redirect** que abre o WhatsApp | Clique não conta como conversão | Gatilho por URL de destino *e* pelos links de redirect |
| **Permissões de tráfego** do pixel liberando só o domínio principal | LP em outro domínio sem eventos | Incluir o domínio da LP na lista do pixel |
| Pixel instalado, mas **sem evento de conversão** | Campanha otimiza pra clique | Conferir eventos no Gerenciador de Eventos antes de lançar |

Antes de dizer "o rastreamento está quebrado", teste: Tag Assistant / Eventos de teste do Meta com uma visita real.`,
  },
  {
    slug: 'nomenclatura',
    group: 'padroes',
    title: 'Padrões de nomes',
    summary: 'Como nomear campanhas, conjuntos, anúncios e UTMs para qualquer pessoa entender a conta.',
    content: `## Meta e Google

| Nível | Padrão | Exemplo |
|---|---|---|
| Campanha | \`#NN · OBJETIVO · Oferta/Produto\` | \`#01 · VENDAS · Cardápio\` |
| Conjunto | \`CJNN · Público · Local\` | \`CJ02 · Aberto Adv+ · Guarujá+Santos\` |
| Anúncio | \`ADNN · Formato · Gancho\` | \`AD03 · Reels · Depoimento Dr. João\` |

- Objetivos: VENDAS, CADASTROS, CONVERSAS, TRÁFEGO, ALCANCE, SEGUIDORES.
- **Nunca** deixe "— Cópia — Cópia": renomeie ao duplicar.
- Nome tem que dizer a verdade: se o conjunto é do interior, não chame de "Capital".

## UTMs

\`utm_source=meta|google · utm_medium=cpc · utm_campaign={nome da campanha} · utm_content={nome do anúncio}\`

## Arquivos e pastas (Drive do cliente)

\`Cliente / 01 Contrato · 02 Briefing · 03 Criativos/AAAA-MM · 04 Relatórios · 05 Acessos (só onde pedir, nunca senha)\``,
  },
  {
    slug: 'comunicacao',
    group: 'padroes',
    title: 'Comunicação com o cliente',
    summary: 'Tom, prazos de resposta, grupo de WhatsApp e mensagens prontas.',
    content: `## Princípios

- **Proativo:** a gente avisa antes do cliente perceber (saldo, queda de resultado, campanha reprovada).
- **Claro:** número com contexto ("R$ 9,80 por cadastro, 18% melhor que setembro"), sem jargão.
- **Registrado:** conversa importante vai pra linha do tempo da ficha.

## Prazos

| Situação | Responder em |
|---|---|
| Dúvida ou pedido no grupo | até 2 horas úteis |
| Saldo crítico | no mesmo dia (mensagem de recarga) |
| Reclamação | no mesmo dia, com ligação se possível |
| Relatório mensal | até o dia combinado na ficha |

## Mensagens prontas

Na ficha do cliente, botão **Mensagem**: recarga de saldo (já com o valor sugerido), relatório do mês, pedido de material, aprovação de criativos e lembrete de honorário. Abre o WhatsApp do contato com o texto pronto e registra o contato na linha do tempo.`,
  },
  {
    slug: 'compliance',
    group: 'padroes',
    title: 'Regras por segmento',
    summary: 'O que a lei e os conselhos profissionais proíbem em anúncios de saúde, imóveis e outros.',
    content: `## Odontologia (Código de Ética Odontológica)

- **Obrigatório:** nome e **CRO da clínica e do responsável técnico** em toda peça.
- **Proibido:** preço, "avaliação gratuita" ou qualquer serviço gratuito, forma de pagamento/parcelamento, antes e depois sem as regras do conselho, promessa de resultado.

## Medicina, fisioterapia, nutrição e estética

- Seguir o conselho de cada profissão (CRM, CREFITO, CRN): identificação do profissional, sem promessa de resultado, sem sensacionalismo.

## Imobiliário

- **CRECI** da imobiliária/corretor na peça. Preço e condições precisam bater com o anunciado pelo cliente.

## Regras de cada cliente

As regras específicas (ex.: frases proibidas, CROs, tom) ficam no **Briefing → Regras** da ficha e aparecem em destaque. **Leia antes de escrever qualquer copy.**`,
  },
  {
    slug: 'ferramentas',
    group: 'ferramentas',
    title: 'Ferramentas e acessos',
    summary: 'O que usamos, para quê e a quem pedir acesso.',
    content: `| Ferramenta | Para quê | Acesso |
|---|---|---|
| **Sistema Pipe** (este) | CRM, contas, campanhas, tarefas, manual | Admin cria em Configurações → Equipe |
| **Meta Business** (portfólio da Pipe) | Contas de anúncio dos clientes como parceira | Admin do portfólio |
| **Google Ads (MCC)** | Contas Google dos clientes | Admin da MCC |
| **Google Tag Manager** | Tags e conversões | Por container, pedido ao cliente no onboarding |
| **n8n** (n8n.pipecompany.tech) | Automações, agentes de WhatsApp, aviso de saldo no Telegram | Admin |
| **Hermes** (Telegram) | Agente de IA ligado ao sistema: agenda, tarefas, resumo do dia | Admin |
| **Claude + skills da Pipe** | Proposta comercial, relatório de performance, LP de grupo VIP, carrosséis, agentes de WhatsApp | Conta da equipe |
| **Vercel / Supabase** | Hospedagem do sistema, sites e banco | Só admin técnico |

## Regras de acesso

- **Senha nunca vai pro sistema, pro grupo ou pra planilha.** No sistema, o campo "Acessos" diz **onde** está o acesso, não qual é.
- Acesso de cliente é sempre pela **parceria** (BM, MCC, GTM), nunca com o login pessoal do dono.
- Saiu da equipe = acessos removidos no mesmo dia.`,
  },
]

export const PLAYBOOK_SLUGS = DEFAULT_PLAYBOOKS.map((p) => p.slug)
