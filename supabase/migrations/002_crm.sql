-- CRM enxuto da Pipe: ficha/contrato do cliente, contatos, funil comercial e
-- linha do tempo de interações. Rodar depois do 001_init.sql. Idempotente.
-- Mesmo esquema de acesso do 001: RLS ligado e nenhuma policy (só o backend,
-- com a service role key, lê e grava).

-- Ficha e contrato do cliente ------------------------------------------------
alter table clients add column if not exists segment text;
alter table clients add column if not exists city text;
alter table clients add column if not exists fee_monthly numeric;        -- honorário mensal da Pipe
alter table clients add column if not exists contract_start date;
alter table clients add column if not exists billing_day int;            -- dia do mês da cobrança
alter table clients add column if not exists renewal_date date;
alter table clients add column if not exists links jsonb not null default '{}'::jsonb; -- site, instagram, drive, gtm, outro
alter table clients add column if not exists access_notes text;          -- ONDE estão os acessos (nunca senhas)
alter table clients add column if not exists last_contact_at timestamptz; -- resumo recalculado a partir de interactions
alter table clients add column if not exists churned_at timestamptz;     -- quando virou "encerrado" (métrica de cancelamento)
do $$
begin
  alter table clients add constraint clients_billing_day_check check (billing_day between 1 and 31);
exception when duplicate_object then null;
end $$;

-- Contatos do cliente --------------------------------------------------------
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  role text,
  phone text,
  email text,
  is_decision_maker boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists contacts_client_idx on contacts (client_id);

-- Funil comercial -------------------------------------------------------------
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  contact_name text,
  contact_phone text,
  contact_email text,
  instagram text,
  segment text,
  source text,
  stage text not null default 'lead'
    check (stage in ('lead', 'meeting', 'proposal', 'negotiation', 'won', 'lost')),
  fee_proposed numeric,
  media_budget numeric,
  proposal_url text,
  next_step text,
  next_step_at date,
  owner text,
  notes text,
  lost_reason text,
  client_id uuid references clients(id) on delete set null, -- preenchido quando vira cliente
  stage_changed_at timestamptz not null default now(),
  won_at timestamptz,
  lost_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leads_stage_idx on leads (stage);
create index if not exists leads_client_idx on leads (client_id);

-- Linha do tempo (reuniões, ligações, WhatsApp, relatórios...) ---------------
-- Serve pra cliente e pra lead. Quando o lead fecha, as interações dele ganham
-- o client_id e aparecem também na linha do tempo do cliente.
create table if not exists interactions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  kind text not null default 'note'
    check (kind in ('meeting', 'call', 'whatsapp', 'email', 'report', 'complaint', 'praise', 'note')),
  summary text not null,
  happened_at timestamptz not null default now(),
  next_step text,
  next_step_at date,
  next_step_done boolean not null default false,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists interactions_client_idx on interactions (client_id, happened_at desc);
create index if not exists interactions_lead_idx on interactions (lead_id, happened_at desc);
create index if not exists interactions_followup_idx on interactions (next_step_at)
  where next_step_done = false and next_step_at is not null;

alter table contacts enable row level security;
alter table leads enable row level security;
alter table interactions enable row level security;
