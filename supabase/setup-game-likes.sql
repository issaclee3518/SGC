-- Reference: game_likes + game_like_counts (remote: game_likes_and_counts)

create table public.game_likes (
  game_id bigint not null references public.games (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

create table public.game_like_counts (
  game_id bigint primary key references public.games (id) on delete cascade,
  like_count bigint not null default 0 check (like_count >= 0)
);

-- Triggers: sync_game_like_count, init_game_like_count (see migration)

alter table public.game_likes enable row level security;
alter table public.game_like_counts enable row level security;

create policy "game_likes_select_authenticated"
  on public.game_likes for select to authenticated using (true);

create policy "game_likes_insert_own"
  on public.game_likes for insert to authenticated
  with check (auth.uid() = user_id);

create policy "game_likes_delete_own"
  on public.game_likes for delete to authenticated
  using (auth.uid() = user_id);

create policy "game_like_counts_select_authenticated"
  on public.game_like_counts for select to authenticated using (true);
