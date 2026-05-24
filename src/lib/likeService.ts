import { supabase } from './supabase';

export type LikeMeta = {
  likeCount: number;
  likedByMe: boolean;
};

export async function fetchLikeMetaForGames(
  gameIds: number[],
  userId: string,
): Promise<Map<number, LikeMeta>> {
  const result = new Map<number, LikeMeta>();
  if (!gameIds.length) return result;

  const [{ data: counts, error: countErr }, { data: likes, error: likeErr }] =
    await Promise.all([
      supabase
        .from('game_like_counts')
        .select('game_id, like_count')
        .in('game_id', gameIds),
      supabase
        .from('game_likes')
        .select('game_id')
        .eq('user_id', userId)
        .in('game_id', gameIds),
    ]);

  if (countErr) throw new Error(countErr.message);
  if (likeErr) throw new Error(likeErr.message);

  const likedSet = new Set((likes ?? []).map((r) => r.game_id as number));

  for (const id of gameIds) {
    const row = counts?.find((c) => c.game_id === id);
    result.set(id, {
      likeCount: row?.like_count ?? 0,
      likedByMe: likedSet.has(id),
    });
  }

  return result;
}

/** 좋아요 토글 — 계정당 게임 1회 (재탭 시 취소) */
export async function toggleGameLike(
  gameId: number,
  userId: string,
  currentlyLiked: boolean,
): Promise<LikeMeta> {
  if (currentlyLiked) {
    const { error } = await supabase
      .from('game_likes')
      .delete()
      .eq('game_id', gameId)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from('game_likes')
      .insert({ game_id: gameId, user_id: userId });
    if (error) throw new Error(error.message);
  }

  const { data, error } = await supabase
    .from('game_like_counts')
    .select('like_count')
    .eq('game_id', gameId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return {
    likeCount: data?.like_count ?? 0,
    likedByMe: !currentlyLiked,
  };
}
