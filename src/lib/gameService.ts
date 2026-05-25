import type { Game } from '../component/GameCard';
import { fetchLikeMetaForGames } from './likeService';
import { supabase } from './supabase';

const GAMES_BUCKET = 'games';

type GameRow = {
  id: number;
  name: string;
  storage_path: string | null;
  icon_storage_path: string | null;
  user_id: string | null;
};

export function getGamePublicUrl(storagePath: string): string {
  const { data } = supabase.storage.from(GAMES_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

function mapRows(rows: GameRow[]): Game[] {
  const storageBaseUrl = getGamesStorageBaseUrl();
  return rows
    .filter(
      (row) =>
        row.storage_path && row.storage_path.toLowerCase().endsWith('.html'),
    )
    .map((row) => ({
      id: String(row.id),
      title: row.name,
      playUrl: getGamePublicUrl(row.storage_path!),
      storageBaseUrl,
      iconUrl: row.icon_storage_path
        ? getGamePublicUrl(row.icon_storage_path)
        : undefined,
    }));
}

async function attachLikes(games: Game[], userId: string): Promise<Game[]> {
  const ids = games.map((g) => Number(g.id)).filter((n) => !Number.isNaN(n));
  const meta = await fetchLikeMetaForGames(ids, userId);
  return games.map((g) => {
    const m = meta.get(Number(g.id));
    return {
      ...g,
      likeCount: m?.likeCount ?? 0,
      likedByMe: m?.likedByMe ?? false,
    };
  });
}

/** 피드 — 로그인한 사용자가 볼 수 있는 전체 게임 + 좋아요 */
export async function fetchGames(userId: string): Promise<Game[]> {
  const { data, error } = await supabase
    .from('games')
    .select('id, name, storage_path, icon_storage_path, user_id')
    .order('id', { ascending: false });

  if (error) throw new Error(error.message);
  if (!data?.length) return [];
  const games = mapRows(data as GameRow[]);
  return attachLikes(games, userId);
}

/** 프로필 — 내가 만든 게임만 */
export async function fetchMyGames(userId: string): Promise<Game[]> {
  const { data, error } = await supabase
    .from('games')
    .select('id, name, storage_path, icon_storage_path, user_id')
    .eq('user_id', userId)
    .order('id', { ascending: false });

  if (error) throw new Error(error.message);
  if (!data?.length) return [];
  return mapRows(data as GameRow[]);
}

function getGamesStorageBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  if (!url) return '';
  return `${url}/storage/v1/object/public/games/`;
}
