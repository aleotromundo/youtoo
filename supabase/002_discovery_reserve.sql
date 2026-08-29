-- Reserva global de candidatos descubiertos por Nowarfy.
-- Esta migración prepara Supabase, pero no conecta todavía el frontend.
-- Las escrituras futuras deben pasar por una función server-side o Edge Function.

create table if not exists public.youtoo_discovery_candidates (
  candidate_key text primary key,
  source text not null check (source in ('youtube', 'openverse', 'commons')),
  source_id text not null,
  media_type text not null check (media_type in ('yt', 'mp3', 'freevideo')),
  url text not null,
  playable_url text not null,
  title text not null,
  artist text not null default '',
  description text not null default '',
  thumbnail_url text not null default '',
  style_key text not null default 'rock metal',
  style_tokens text[] not null default '{}',
  radio_eligible boolean not null default false,
  contexts text[] not null default '{}',
  query_context text not null default '',
  seed_key text,
  license text not null default '',
  license_version text not null default '',
  source_url text not null default '',
  duration_seconds integer,
  embeddable boolean,
  status text not null default 'available'
    check (status in ('available', 'queued', 'played', 'invalid', 'expired')),
  use_count integer not null default 0 check (use_count >= 0),
  discovered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists youtoo_discovery_candidates_source_id_idx
  on public.youtoo_discovery_candidates (source, source_id);
create index if not exists youtoo_discovery_candidates_radio_style_idx
  on public.youtoo_discovery_candidates (radio_eligible, style_key, status, last_used_at);
create index if not exists youtoo_discovery_candidates_source_idx
  on public.youtoo_discovery_candidates (source, discovered_at desc);
create index if not exists youtoo_discovery_candidates_expiry_idx
  on public.youtoo_discovery_candidates (expires_at);

create table if not exists public.youtoo_discovery_queries (
  query_key text primary key,
  source text not null check (source in ('youtube', 'openverse', 'commons')),
  query text not null,
  style_key text not null default 'rock metal',
  seed_key text,
  next_page_token text,
  pages_consumed integer not null default 0 check (pages_consumed >= 0),
  status text not null default 'ok'
    check (status in ('ok', 'quota', 'error')),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  retry_after timestamptz,
  result_count integer not null default 0 check (result_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists youtoo_discovery_queries_source_style_idx
  on public.youtoo_discovery_queries (source, style_key, status, retry_after);

alter table public.youtoo_discovery_candidates enable row level security;
alter table public.youtoo_discovery_queries enable row level security;

revoke all on table public.youtoo_discovery_candidates from anon, authenticated;
revoke all on table public.youtoo_discovery_queries from anon, authenticated;

grant select on table public.youtoo_discovery_candidates to authenticated;
grant select on table public.youtoo_discovery_queries to authenticated;

-- La reserva global es legible para personas autenticadas, pero no se escribe desde el navegador.
-- Las escrituras futuras deben usar una Edge Function o el backend con service_role.
drop policy if exists "Candidatos globales legibles por usuarios autenticados" on public.youtoo_discovery_candidates;
create policy "Candidatos globales legibles por usuarios autenticados"
on public.youtoo_discovery_candidates
for select
to authenticated
using (true);

drop policy if exists "Consultas globales legibles por usuarios autenticados" on public.youtoo_discovery_queries;
create policy "Consultas globales legibles por usuarios autenticados"
on public.youtoo_discovery_queries
for select
to authenticated
using (true);

comment on table public.youtoo_discovery_candidates is
  'Reserva global de URLs y metadatos descubiertos; no almacena audio ni video.';
comment on table public.youtoo_discovery_queries is
  'Estado de consultas y cuota para evitar repetir búsquedas agotadas.';
