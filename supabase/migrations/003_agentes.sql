-- Agentes (Hermes etc.) e relatórios. Rodar depois do 002_crm.sql. Idempotente.
-- Mesmo esquema de acesso: RLS ligado e nenhuma policy (só o backend acessa).

-- Chaves de API dos agentes. Guarda só o hash SHA-256; a chave em texto
-- aparece uma única vez, na criação (tela Configurações).
create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  prefix text not null,
  key_hash text not null unique,
  scope text not null default 'read_write' check (scope in ('read', 'read_write')),
  created_by text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

-- Relatórios e análises (Markdown), publicados pela equipe ou pelo agente.
-- Sem client_id = relatório geral da agência (ex: resumo diário).
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  kind text not null default 'report' check (kind in ('report', 'analysis', 'daily')),
  title text not null,
  content text not null,
  period_start date,
  period_end date,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists reports_client_idx on reports (client_id, created_at desc);
create index if not exists reports_created_idx on reports (created_at desc);

alter table api_keys enable row level security;
alter table reports enable row level security;
