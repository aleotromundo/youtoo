-- YouToo: perfil de descubrimiento sincronizado (opt-in)
-- Esta migración no se conecta sola: debe aplicarse en un proyecto Supabase
-- después de configurar Supabase Auth. Nunca expone claves ni datos privados.

create table if not exists public.youtoo_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  personalization_enabled boolean not null default true,
  sync_enabled boolean not null default false,
  profile_version smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.youtoo_discovery_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('search', 'play', 'channel_open', 'playlist_open')),
  subject text not null check (char_length(subject) between 1 and 240),
  subject_id text,
  context jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

-- Agregados de bajo volumen que permiten recomendar sin releer todo el historial.
create table if not exists public.youtoo_interest_topics (
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null check (char_length(topic) between 1 and 120),
  score numeric(8,2) not null default 1 check (score >= 0),
  last_signal_at timestamptz not null default now(),
  primary key (user_id, topic)
);

create index if not exists youtoo_discovery_events_user_occurred_idx
  on public.youtoo_discovery_events (user_id, occurred_at desc);
create index if not exists youtoo_interest_topics_user_score_idx
  on public.youtoo_interest_topics (user_id, score desc, last_signal_at desc);

create or replace function public.youtoo_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists youtoo_preferences_set_updated_at on public.youtoo_preferences;
create trigger youtoo_preferences_set_updated_at
before update on public.youtoo_preferences
for each row execute procedure public.youtoo_set_updated_at();

-- Defensa en profundidad: las tablas privadas no tienen acceso anónimo.
alter table public.youtoo_preferences enable row level security;
alter table public.youtoo_discovery_events enable row level security;
alter table public.youtoo_interest_topics enable row level security;

revoke all on table public.youtoo_preferences from anon, authenticated;
revoke all on table public.youtoo_discovery_events from anon, authenticated;
revoke all on table public.youtoo_interest_topics from anon, authenticated;

grant select, insert, update, delete on table public.youtoo_preferences to authenticated;
grant select, insert, update, delete on table public.youtoo_discovery_events to authenticated;
grant select, insert, update, delete on table public.youtoo_interest_topics to authenticated;

create policy "Cada usuario administra sus preferencias YouToo"
on public.youtoo_preferences
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Cada usuario administra su historial YouToo"
on public.youtoo_discovery_events
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Cada usuario administra sus intereses YouToo"
on public.youtoo_interest_topics
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
