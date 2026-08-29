-- Conserva la relación muchos-a-muchos entre candidatos globales y quienes los descubrieron.
-- Permite mostrar el catálogo completo y, para usuarios registrados, solo sus propios descubrimientos.

create table if not exists public.youtoo_discovery_attributions (
  candidate_key text not null references public.youtoo_discovery_candidates(candidate_key) on delete cascade,
  discovered_by text not null,
  first_discovered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (candidate_key, discovered_by)
);

create index if not exists youtoo_discovery_attributions_owner_idx
  on public.youtoo_discovery_attributions (discovered_by, last_seen_at desc);

create index if not exists youtoo_discovery_attributions_candidate_idx
  on public.youtoo_discovery_attributions (candidate_key);

-- Migra la atribución singular de la primera versión sin eliminarla todavía, para que
-- los despliegues existentes conserven el historial ya recogido.
insert into public.youtoo_discovery_attributions (candidate_key, discovered_by, first_discovered_at, last_seen_at)
select candidate_key, discovered_by, coalesce(discovered_at, now()), coalesce(last_seen_at, now())
from public.youtoo_discovery_candidates
where nullif(trim(discovered_by), '') is not null
on conflict (candidate_key, discovered_by) do nothing;

alter table public.youtoo_discovery_attributions enable row level security;
revoke all on table public.youtoo_discovery_attributions from anon, authenticated;

comment on table public.youtoo_discovery_attributions is
  'Relación de usuarios o sesiones que descubrieron cada candidato de la reserva global.';
