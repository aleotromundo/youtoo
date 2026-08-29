-- Extiende la reserva global para la sincronización híbrida de YouToo.
-- Ejecutar después de 002_discovery_reserve.sql.

alter table if exists public.youtoo_discovery_candidates
drop constraint if exists youtoo_discovery_candidates_source_check;

alter table if exists public.youtoo_discovery_candidates
add constraint youtoo_discovery_candidates_source_check
check (source in ('youtube', 'openverse', 'commons', 'jamendo'));

alter table if exists public.youtoo_discovery_queries
drop constraint if exists youtoo_discovery_queries_source_check;

alter table if exists public.youtoo_discovery_queries
add constraint youtoo_discovery_queries_source_check
check (source in ('youtube', 'openverse', 'commons', 'jamendo'));

create index if not exists youtoo_discovery_candidates_artist_style_idx
  on public.youtoo_discovery_candidates (artist, style_key, status, last_used_at);

comment on table public.youtoo_discovery_candidates is
  'Reserva global de URLs y metadatos descubiertos por YouTube, Openverse, Wikimedia Commons y Jamendo; no almacena audio ni video.';
