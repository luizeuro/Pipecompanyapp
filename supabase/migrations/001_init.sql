-- Pipe Company Ads Monitor — schema inicial.
-- Rodar uma vez no Supabase: SQL Editor → New query → colar este arquivo → Run.
-- É idempotente (pode rodar de novo sem quebrar nada).

create extension if not exists pgcrypto;

-- Equipe da agência que acessa o painel. Senha guardada só como hash bcrypt.
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

-- Clientes. Os campos *_snapshot e last_* são "resumos": guardam o último
-- estado conhecido pra lista principal carregar numa consulta só, e são
-- recalculados pelo backend sempre que o dado de origem muda.
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'churned')),
  tags text[] not null default '{}',
  manager text,
  notes text,
  meta_ad_account_id text,
  meta_access_token_enc text,
  google_ads_customer_id text,
  result_metric text not null default 'auto',
  balance_alert_threshold numeric not null default 100,
  monthly_budget numeric,
  meta_snapshot jsonb,
  google_snapshot jsonb,
  last_check_at timestamptz,
  last_optimization_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Histórico de cada verificação (alimenta o gráfico de saldo do cliente).
-- O cron apaga automaticamente o que tiver mais de 90 dias.
create table if not exists account_snapshots (
  id bigint generated always as identity primary key,
  client_id uuid not null references clients(id) on delete cascade,
  platform text not null check (platform in ('meta', 'google')),
  checked_at timestamptz not null default now(),
  ok boolean not null default true,
  balance numeric,
  spend_today numeric,
  spend_yesterday numeric,
  spend_7d numeric,
  results_7d numeric,
  active_campaigns int,
  data jsonb
);
create index if not exists account_snapshots_client_checked_idx
  on account_snapshots (client_id, checked_at desc);

create table if not exists optimizations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  platform text not null default 'meta' check (platform in ('meta', 'google', 'both', 'other')),
  category text not null default 'outro',
  description text not null,
  performed_at timestamptz not null default now(),
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists optimizations_client_performed_idx
  on optimizations (client_id, performed_at desc);

create table if not exists pendencias (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'open' check (status in ('open', 'done')),
  due_date date,
  assignee text,
  created_by text,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists pendencias_status_idx on pendencias (status, client_id);

-- Um alerta fica aberto enquanto a condição persistir; quando ela some na
-- próxima verificação, o backend resolve sozinho (resolved_by = 'automático').
create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  platform text not null,
  type text not null,
  severity text not null default 'warning' check (severity in ('critical', 'warning', 'info')),
  message text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text,
  emailed_at timestamptz
);
create index if not exists alerts_open_idx on alerts (client_id) where resolved_at is null;

-- Estado interno do app (ex: data do último resumo diário enviado).
create table if not exists app_state (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);

-- RLS ligado sem nenhuma policy: a chave anon não lê nada. Só o backend,
-- com a service role key (que ignora RLS), acessa as tabelas.
alter table users enable row level security;
alter table clients enable row level security;
alter table account_snapshots enable row level security;
alter table optimizations enable row level security;
alter table pendencias enable row level security;
alter table alerts enable row level security;
alter table app_state enable row level security;
