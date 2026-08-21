-- Control remoto de YouToo para usuarios autenticados.
-- El modo anónimo sigue funcionando localmente; estas tablas solo habilitan control compartido.

create table if not exists public.youtoo_remote_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_key text not null check (char_length(device_key) between 16 and 180),
  device_name text not null default 'Dispositivo YouToo' check (char_length(device_name) between 1 and 120),
  role text not null default 'controller' check (role in ('player', 'controller')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, device_key)
);

create table if not exists public.youtoo_remote_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  active_device_id uuid references public.youtoo_remote_devices(id) on delete set null,
  state jsonb not null default '{}'::jsonb,
  version bigint not null default 0,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours')
);

create unique index if not exists youtoo_remote_sessions_user_idx
  on public.youtoo_remote_sessions(user_id);
create index if not exists youtoo_remote_devices_user_seen_idx
  on public.youtoo_remote_devices(user_id, last_seen_at desc);

create table if not exists public.youtoo_remote_commands (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.youtoo_remote_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid references public.youtoo_remote_devices(id) on delete set null,
  command jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
create index if not exists youtoo_remote_commands_session_created_idx
  on public.youtoo_remote_commands(session_id, created_at desc);

alter table public.youtoo_remote_devices enable row level security;
alter table public.youtoo_remote_sessions enable row level security;
alter table public.youtoo_remote_commands enable row level security;

revoke all on table public.youtoo_remote_devices from anon;
revoke all on table public.youtoo_remote_sessions from anon;
revoke all on table public.youtoo_remote_commands from anon;
grant select, insert, update, delete on table public.youtoo_remote_devices to authenticated;
grant select, insert, update, delete on table public.youtoo_remote_sessions to authenticated;
grant select, insert, update, delete on table public.youtoo_remote_commands to authenticated;

create policy "Cada usuario administra sus dispositivos remotos"
on public.youtoo_remote_devices for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Cada usuario administra su sesión remota"
on public.youtoo_remote_sessions for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Cada usuario administra sus comandos remotos"
on public.youtoo_remote_commands for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Realtime Broadcast/Presence se usa por canales privados; no se exponen tablas a anon.
comment on table public.youtoo_remote_sessions is
  'Estado compartido del reproductor para una cuenta autenticada; el iFrame activo es el único ejecutor.';
comment on table public.youtoo_remote_commands is
  'Comandos remotos de reproducción; el dispositivo jugador los consume y publica el estado resultante.';

-- Habilita los cambios de estas tablas en Supabase Realtime sin fallar si ya fueron agregadas.
do $$ begin alter publication supabase_realtime add table public.youtoo_remote_devices; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.youtoo_remote_sessions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.youtoo_remote_commands; exception when duplicate_object then null; end $$;
