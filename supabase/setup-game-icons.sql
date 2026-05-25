-- Game thumbnail (chat attach → publish copies to {id}.jpg)

alter table public.games
  add column if not exists icon_storage_path text;

comment on column public.games.icon_storage_path is
  'Supabase Storage path in games bucket (e.g. 42.jpg)';

-- games bucket: allow thumbnails (run once on remote)
-- update storage.buckets
-- set allowed_mime_types = array[
--   'text/html', 'text/javascript', 'application/javascript',
--   'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
--   'image/gif', 'image/heic', 'image/heif'
-- ]::text[]
-- where id = 'games';
