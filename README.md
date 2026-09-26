# Pipe Company · CRM e monitor de contas

App interno da Pipe Company com duas partes:

- **CRM enxuto**: tela *Hoje* (o que fazer agora), funil comercial em quadro,
  ficha completa de cada cliente (contrato, contatos, links, linha do tempo),
  saúde do cliente (risco de cancelamento) e *Números* da agência (receita
  recorrente, ticket médio, taxa de fechamento, cancelamentos).
- **Monitor de tráfego**: saldo das contas Meta Ads e Google Ads (e quantos
  dias ele ainda dura), veiculação, resultados dos últimos 7 dias,
  otimizações, pendências e alertas automáticos por e-mail.

## Como funciona

| Camada | Tecnologia |
|---|---|
| Backend | Node.js + Express, uma função serverless só (`api/index.js`) na Vercel |
| Banco | Supabase (Postgres), acessado só pelo backend com a service role key (RLS ligado, sem policies: a chave pública não acessa nada) |
| Frontend | React + Vite + Tailwind (`web/`), modo claro e escuro |
| Agendamento | Cron da Vercel, 3x por dia (`crons` no `vercel.json`) |
| E-mail | Resend |
| Hospedagem | Vercel, deploy automático a cada commit na `main` |

```
api/index.js          todas as rotas da API (inclui /api/mcp para agentes)
lib/                  regras do CRM (crm.js), ferramentas MCP (mcp.js), integrações, alertas, e-mail, banco
supabase/migrations/  schema SQL (rodar uma vez no Supabase)
web/src/pages/        uma página por aba (Hoje, Funil, Clientes, Relatórios, Números, Contas, Otimizações, Pendências, Alertas, Configurações)
web/src/components/   peças compartilhadas (cartão do cliente, painel de alertas, formulários, gráfico)
web/src/lib/          filtros, etiquetas, régua de urgência, formatação, chamadas à API
dev/server.js         sobe a API localmente
```

### Regras do CRM

- **Saúde do cliente** (`lib/health.js`, calculada no backend): nota de 0 a
  100 que perde pontos por falta de contato e de otimização (mesma régua de
  dias abaixo), alertas abertos, pendências atrasadas e saldo acabando.
  75+ = Saudável, 50–74 = Atenção, abaixo de 50 = Em risco. Cliente com até
  14 dias de contrato não perde ponto por "nunca teve contato/otimização".
- **Último contato**: a interação mais recente da linha do tempo que não seja
  nota interna (`recalcLastContact` em `lib/summary.js`).
- **Funil**: Lead → Reunião → Proposta enviada → Negociação → Fechado/Perdido.
  "Fechou!" cria o cliente com honorário, verba, contato, Instagram, link da
  proposta e todo o histórico da negociação.
- **Hoje**: próximos passos com data (de contatos e do funil) e pendências
  com prazo, em atrasados / hoje / próximos 7 dias.
- **Números**: só valores da ficha (honorário, verba, datas); não há controle
  de pagamento. Receita recorrente de um mês = honorários de quem já tinha
  começado e ainda não tinha cancelado no fim do mês.

### Agente (Hermes) via MCP

O CRM expõe um servidor **MCP** em `/api/mcp` (Streamable HTTP, sem sessão)
para agentes como o [Hermes Agent](https://hermes-agent.nousresearch.com/)
lerem e alimentarem o CRM. As ferramentas ficam em `lib/mcp.js` e chamam as
mesmas funções de `lib/crm.js` que a tela usa.

- **Acesso**: chave de API criada em *Configurações → Agentes e API* (só
  admin). O banco guarda só o hash; a chave aparece uma vez. Pode ser
  "leitura e escrita" ou "só leitura", e revogada a qualquer momento.
- **Ler**: `listar_clientes`, `ver_cliente`, `desempenho_contas`,
  `agenda_hoje`, `funil_comercial`, `ver_lead`, `numeros_agencia`,
  `listar_tarefas`, `listar_relatorios`.
- **Escrever**: `criar_tarefa`, `concluir_tarefa`, `registrar_contato`,
  `registrar_otimizacao`, `publicar_relatorio`, `criar_lead`, `atualizar_lead`.
- **Limites**: agente nunca apaga, não mexe em equipe/senhas/chaves/
  configurações e não fecha contrato (virar cliente é só pela equipe). Tudo que
  ele grava sai com autor "<nome> (agente)" e o selo "agente" na tela.
- **Hermes**: em `~/.hermes/config.yaml`:

  ```yaml
  mcp_servers:
    pipe_crm:
      url: "https://pipecompanyapp.vercel.app/api/mcp"
      headers:
        Authorization: "Bearer ${PIPE_CRM_API_KEY}"
  ```

  e a chave em `~/.hermes/.env` (`PIPE_CRM_API_KEY=...`). Teste com
  `hermes mcp test pipe_crm`. A skill `pipe-crm` (em `~/.hermes/skills`)
  ensina as rotinas (relatório semanal, resumo do dia, análise das contas,
  tarefas por mensagem).

### Regras do monitor de tráfego

- **Saldo**: crítico quando dura menos de 3 dias (no ritmo médio dos últimos
  7 dias) ou fica abaixo do mínimo configurado no cliente; atenção quando dura
  menos de 7 dias. Regra única em `lib/balance.js`.
- **Régua de otimização**: verde até 14 dias, amarelo de 15 a 29, vermelho a
  partir de 30, cinza quando nunca foi registrada (`web/src/lib/urgency.js`).
- **Alertas** (`lib/alertRules.js`): saldo baixo, conta bloqueada, campanha
  ativa sem gasto ontem e falha na consulta. Um alerta fica aberto enquanto o
  problema existir e se resolve sozinho quando ele some.
- **E-mail**: um resumo diário na primeira verificação depois de `CHECK_HOUR`,
  e fora isso só quando surge alerta novo (`lib/notify.js`).

### De onde vem o saldo

- **Meta, conta pré-paga** (boleto/Pix): o "Saldo disponível" que a Meta
  informa na forma de pagamento.
- **Meta com limite de gastos da conta**: quanto falta para bater o limite.
- **Meta pós-paga no cartão**: não existe saldo; o painel mostra só gasto e resultados.
- **Google com orçamento de conta** (faturamento mensal): quanto sobra do orçamento aprovado.
- **Google com pagamento manual**: a API do Google não informa esse saldo, e o
  painel avisa isso no cartão.

## Colocar no ar

1. **Supabase**: crie o projeto (região São Paulo) e rode, no *SQL Editor*,
   `supabase/migrations/001_init.sql`, depois `002_crm.sql` e `003_agentes.sql`.
2. **Vercel**: importe este repositório (Framework Preset: *Other*; o
   `vercel.json` já define build, rotas e o cron) e crie as variáveis de
   ambiente listadas em `.env.example`. O mínimo para abrir:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (a chave secreta do Supabase),
   `JWT_SECRET`, `ENCRYPTION_KEY` e `CRON_SECRET`. Para gerar os segredos:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
3. Abra o app: a primeira tela cria o acesso de administrador. O resto da
   equipe é cadastrado em *Configurações → Equipe*.
4. **Agendamento**: nada a fazer. O Cron da Vercel chama `/api/cron/check`
   3x por dia (12h, 17h e 22h UTC = 9h, 14h e 19h de Brasília; no plano Hobby
   o horário pode variar até 59 minutos) e manda o `CRON_SECRET` sozinho.
5. **Meta Ads**: no Business Manager da Pipe, crie um usuário do sistema,
   atribua a ele as contas de anúncio dos clientes e gere um token com
   `ads_read`. Coloque em `META_SYSTEM_USER_TOKEN` (e `META_APP_SECRET`, se o
   app exigir a chave secreta). Conta fora do BM da Pipe pode ter token
   próprio no cadastro do cliente (fica criptografado no banco).
6. **Google Ads**: `GOOGLE_ADS_DEVELOPER_TOKEN` + OAuth (`_CLIENT_ID`,
   `_CLIENT_SECRET`, `_REFRESH_TOKEN`) de um usuário com acesso à MCC da Pipe,
   e o ID da MCC em `GOOGLE_ADS_LOGIN_CUSTOMER_ID`.
7. **E-mail**: `RESEND_API_KEY`, `ALERT_EMAIL_FROM` (de um domínio verificado
   no Resend) e `ALERT_EMAIL_TO` (pode ter vários, separados por vírgula).

Depois de mudar qualquer variável na Vercel, faça *Redeploy*.

## Rodar localmente

```bash
npm install && npm install --prefix web
npm run dev:api     # API em http://localhost:3001
npm run dev:web     # painel em http://localhost:5180
```

Sem `SUPABASE_URL` no `.env`, a API local usa um **banco em memória com
clientes de demonstração** (zera a cada reinício) e simula as respostas da
Meta e do Google no "Verificar agora". Na primeira tela, crie um acesso de
teste qualquer (ex: `teste@pipe.local`). Isso nunca acontece na Vercel: lá,
sem Supabase configurado, o app mostra o passo a passo do que falta.

## Personalizar

- **Etiquetas de cliente**: `web/src/lib/tags.js`
- **Filtros e ordenações**: `web/src/lib/clientFilters.js` (valem para todas as telas)
- **Tipos de otimização**: `web/src/lib/constants.js`
- **Cores da marca**: `web/tailwind.config.js` (`brand`, `ink`, `paper`)
- **Logo**: `web/public/pipe-logo.png` (branco sobre fundo preto)
