-- Reference: game_leaderboard + realtime TOP5 (applied via Supabase MCP migration game_leaderboard_realtime)

create table public.game_leaderboard (
  game_id bigint not null references public.games (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  score numeric not null check (score >= 0),
  updated_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

create index game_leaderboard_game_score_idx
  on public.game_leaderboard (game_id, score desc);

-- RPC: upsert best score for auth.uid()
-- upsert_game_leaderboard_score(p_game_id bigint, p_score numeric)

alter publication supabase_realtime add table public.game_leaderboard;
