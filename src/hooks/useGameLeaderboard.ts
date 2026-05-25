import React from 'react';
import {
  fetchLeaderboardTop5,
  subscribeLeaderboard,
  type LeaderboardEntry,
} from '../lib/leaderboardService';

/** 피드 카드 — Realtime 구독 + 패널 열림/점수 제출 시 목록 갱신 */
export function useGameLeaderboard(
  gameId: string,
  panelOpen: boolean,
  refreshTick = 0,
) {
  const [entries, setEntries] = React.useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const numericId = Number(gameId);

  const refresh = React.useCallback(async () => {
    if (!Number.isFinite(numericId)) return;
    try {
      setError(null);
      const rows = await fetchLeaderboardTop5(numericId);
      setEntries(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : '랭킹 불러오기 실패');
    }
  }, [numericId]);

  React.useEffect(() => {
    if (!Number.isFinite(numericId)) return;
    const unsubscribe = subscribeLeaderboard(numericId, () => {
      void refresh();
    });
    return unsubscribe;
  }, [numericId, refresh]);

  React.useEffect(() => {
    if (!panelOpen || !Number.isFinite(numericId)) return;
    let cancelled = false;
    setLoading(true);
    void refresh().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [panelOpen, numericId, refresh, refreshTick]);

  return { entries, loading, error, refresh };
}
