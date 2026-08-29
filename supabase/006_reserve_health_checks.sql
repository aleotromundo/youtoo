-- Estado de salud para la revisión periódica de URLs.
-- Ejecutar después de 005_reserve_attribution.sql.
-- La limpieza marca candidatos; no elimina filas automáticamente.

alter table if exists public.youtoo_discovery_candidates
  add column if not exists health_status text not null default 'unverified';

alter table if exists public.youtoo_discovery_candidates
  add column if not exists health_checked_at timestamptz;

alter table if exists public.youtoo_discovery_candidates
  add column if not exists health_next_check_at timestamptz;

alter table if exists public.youtoo_discovery_candidates
  add column if not exists health_http_status integer;

alter table if exists public.youtoo_discovery_candidates
  add column if not exists health_content_type text;

alter table if exists public.youtoo_discovery_candidates
  add column if not exists health_fail_count integer not null default 0;

alter table if exists public.youtoo_discovery_candidates
  add column if not exists health_pass_count integer not null default 0;

alter table if exists public.youtoo_discovery_candidates
  add column if not exists health_error text;

update public.youtoo_discovery_candidates
set health_status = case
  when status = 'invalid' then 'invalid'
  else 'unverified'
end
where health_status is null
   or health_status = ''
   or (status = 'invalid' and health_status = 'unverified');

alter table public.youtoo_discovery_candidates
  drop constraint if exists youtoo_discovery_candidates_health_status_check;

alter table public.youtoo_discovery_candidates
  add constraint youtoo_discovery_candidates_health_status_check
  check (health_status in ('unverified', 'healthy', 'suspect', 'invalid'));

alter table public.youtoo_discovery_candidates
  drop constraint if exists youtoo_discovery_candidates_health_fail_count_check;

alter table public.youtoo_discovery_candidates
  add constraint youtoo_discovery_candidates_health_fail_count_check
  check (health_fail_count >= 0);

alter table public.youtoo_discovery_candidates
  drop constraint if exists youtoo_discovery_candidates_health_pass_count_check;

alter table public.youtoo_discovery_candidates
  add constraint youtoo_discovery_candidates_health_pass_count_check
  check (health_pass_count >= 0);

create index if not exists youtoo_discovery_candidates_health_schedule_idx
  on public.youtoo_discovery_candidates (health_status, health_next_check_at, discovered_at);

comment on column public.youtoo_discovery_candidates.health_status is
  'Estado de la última revisión: unverified, healthy, suspect o invalid.';
comment on column public.youtoo_discovery_candidates.health_next_check_at is
  'Próximo momento elegible para revisión automática.';
comment on column public.youtoo_discovery_candidates.health_fail_count is
  'Fallos consecutivos; no se invalida una URL por un único fallo.';
