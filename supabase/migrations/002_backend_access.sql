-- Acesso do backend sem a service role key (opcional: só é necessário quando
-- a Vercel usa SUPABASE_PUBLISHABLE_KEY + SUPABASE_BACKEND_SECRET).
--
-- A API manda o header x-pipe-backend-secret em toda requisição. As policies
-- abaixo liberam as tabelas para a chave pública (role anon) SOMENTE quando
-- esse header bate com o segredo guardado em private.backend_secret — um
-- schema que a API REST do Supabase não expõe. Sem o header certo, a chave
-- pública continua sem ler nem gravar nada.
--
-- O segredo NÃO fica neste arquivo (o repositório é público). Depois de rodar
-- esta migração, grave-o no SQL Editor:
--   insert into private.backend_secret (secret) values ('<mesmo valor da Vercel>')
--   on conflict (id) do update set secret = excluded.secret;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.backend_secret (
  id boolean primary key default true check (id),
  secret text not null check (length(secret) >= 32)
);
revoke all on private.backend_secret from public, anon, authenticated;

-- security definer: roda com o dono (postgres), que consegue ler o schema
-- privado; quem chama só recebe true/false.
create or replace function public.pipe_is_backend()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (current_setting('request.headers', true)::json ->> 'x-pipe-backend-secret')
      = (select s.secret from private.backend_secret s where s.id),
    false
  );
$$;
revoke all on function public.pipe_is_backend() from public;
grant execute on function public.pipe_is_backend() to anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['users', 'clients', 'account_snapshots', 'optimizations', 'pendencias', 'alerts', 'app_state']
  loop
    execute format('drop policy if exists pipe_backend_all on public.%I', t);
    -- "(select ...)" faz o Postgres avaliar a função uma vez por consulta, não por linha.
    execute format(
      'create policy pipe_backend_all on public.%I for all to anon '
      'using ((select public.pipe_is_backend())) with check ((select public.pipe_is_backend()))',
      t
    );
  end loop;
end $$;
