-- Música local en Supabase Storage (YouToo).
-- Ejecutar en el SQL Editor de Supabase (una sola vez).
-- Cada usuario sube sus archivos en una carpeta con su id: <user_id>/<archivo>.

insert into storage.buckets (id, name, public)
values ('nowarfy-music', 'nowarfy-music', false)
on conflict (id) do nothing;

drop policy if exists "nowarfy_music_select_own" on storage.objects;
create policy "nowarfy_music_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'nowarfy-music' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "nowarfy_music_insert_own" on storage.objects;
create policy "nowarfy_music_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'nowarfy-music' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "nowarfy_music_update_own" on storage.objects;
create policy "nowarfy_music_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'nowarfy-music' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "nowarfy_music_delete_own" on storage.objects;
create policy "nowarfy_music_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'nowarfy-music' and (storage.foldername(name))[1] = auth.uid()::text);
