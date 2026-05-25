import { supabase } from './supabase';

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  userLabel: string;
  score: number;
};

type LeaderboardRow = {
  user_id: string;
  score: number;
};

/** 표시용 짧은 사용자 ID */
export function formatLeaderboardUserId(userId: string): string {
  const compact = userId.replace(/-/g, '');
  return compact.length > 8 ? `${compact.slice(0, 8)}…` : compact;
}

export async function fetchLeaderboardTop5(
  gameId: number,
): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from('game_leaderboard')
    .select('user_id, score')
    .eq('game_id', gameId)
    .order('score', { ascending: false })
    .limit(5);

  if (error) throw new Error(error.message);

  return ((data ?? []) as LeaderboardRow[]).map((row, i) => ({
    rank: i + 1,
    userId: row.user_id,
    userLabel: formatLeaderboardUserId(row.user_id),
    score: Number(row.score),
  }));
}

/** 게임에서 최고 점수 갱신 (본인 기록만, 더 높은 점수일 때만 반영) */
export async function submitLeaderboardScore(
  gameId: number,
  score: number,
): Promise<void> {
  if (!Number.isFinite(score) || score < 0) return;

  const { error } = await supabase.rpc('upsert_game_leaderboard_score', {
    p_game_id: gameId,
    p_score: score,
  });

  if (error) throw new Error(error.message);
}

export function subscribeLeaderboard(
  gameId: number,
  onChange: () => void,
): () => void {
  const channel = supabase
    .channel(`leaderboard:${gameId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'game_leaderboard',
        filter: `game_id=eq.${gameId}`,
      },
      () => onChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
