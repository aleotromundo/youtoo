-- Añade atribución de descubrimiento a la reserva global.
alter table if exists public.youtoo_discovery_candidates
add column if not exists discovered_by text;

alter table if exists public.youtoo_discovery_queries
add column if not exists discovered_by text;

create index if not exists youtoo_discovery_candidates_discovered_by_idx
  on public.youtoo_discovery_candidates (discovered_by);

create index if not exists youtoo_discovery_queries_discovered_by_idx
  on public.youtoo_discovery_queries (discovered_by);

comment on column public.youtoo_discovery_candidates.discovered_by is
  'ID de usuario o sesión que descubrió este candidato.';
comment on column public.youtoo_discovery_queries.discovered_by is
  'ID de usuario o sesión que realizó esta consulta.';
