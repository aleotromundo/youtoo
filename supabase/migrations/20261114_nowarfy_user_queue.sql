-- Cola de reproducción sincronizada entre dispositivos (YouTOO).
-- Ejecutar en el SQL Editor de Supabase (una sola vez).

create table if not exists public.nowarfy_user_queue (
  user_id uuid primary key references auth.users (id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.nowarfy_user_queue enable row level security;

drop policy if exists "nowarfy_user_queue_select_own" on public.nowarfy_user_queue;
create policy "nowarfy_user_queue_select_own" on public.nowarfy_user_queue
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "nowarfy_user_queue_insert_own" on public.nowarfy_user_queue;
create policy "nowarfy_user_queue_insert_own" on public.nowarfy_user_queue
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "nowarfy_user_queue_update_own" on public.nowarfy_user_queue;
create policy "nowarfy_user_queue_update_own" on public.nowarfy_user_queue
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "nowarfy_user_queue_delete_own" on public.nowarfy_user_queue;
create policy "nowarfy_user_queue_delete_own" on public.nowarfy_user_queue
  for delete to authenticated using (auth.uid() = user_id);

-- Realtime: avisa a los dispositivos cuando cambia la cola.
do $$
begin
  alter publication supabase_realtime add table public.nowarfy_user_queue;
exception when duplicate_object then
  null;
end $$;
