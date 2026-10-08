-- Sistema Pipe: o que a Pipe entrega pra cada cliente, o briefing que o time
-- precisa saber antes de mexer na conta, a cadência (otimização semanal e
-- relatório mensal), o checklist de onboarding e o Manual da Pipe.

-- Serviços contratados: meta_ads, google_ads, paginas, automacao, dados, criativos.
alter table clients add column if not exists services text[] not null default '{}';
-- Briefing: objetivo, oferta, publico, diferenciais, tom, regras, concorrentes, observacoes.
alter table clients add column if not exists briefing jsonb not null default '{}'::jsonb;
-- Meta de custo por resultado (R$): campanha acima disso vira recomendação.
alter table clients add column if not exists target_cpr numeric;
-- Cadência: dia da semana da otimização (0 = domingo) e dia do mês do relatório.
alter table clients add column if not exists optimization_weekday int check (optimization_weekday between 0 and 6);
alter table clients add column if not exists report_day int check (report_day between 1 and 28);

-- Checklist de onboarding (e outros, no futuro) por cliente.
create table if not exists checklist_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  kind text not null default 'onboarding',
  section text not null,
  title text not null,
  hint text,
  position int not null default 0,
  done_at timestamptz,
  done_by text,
  created_at timestamptz not null default now()
);
create index if not exists checklist_items_client_idx on checklist_items (client_id, kind, position);
alter table checklist_items enable row level security;

-- Manual da Pipe: o conteúdo padrão mora no código (lib/playbooks.js); aqui
-- fica só o que a equipe editar pela tela.
create table if not exists playbooks (
  slug text primary key,
  title text not null,
  content text not null default '',
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table playbooks enable row level security;
