import type { Game } from '../component/GameCard';
import { supabase } from './supabaseClient';

const GAMES_BUCKET = 'games';

type GameRow = {
  id: number;
  name: string;
  storage_path: string | null;
};

export function getGamePublicUrl(storagePath: string): string {
  const { data } = supabase.storage.from(GAMES_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

/** Supabase에서 게임 목록 직접 조회 (SGS 경유 없음) */
export async function fetchGames(): Promise<Game[]> {
  const { data, error } = await supabase
    .from('games')
    .select('id, name, storage_path')
    .order('id', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.length) {
    return [];
  }

  const storageBaseUrl = getGamesStorageBaseUrl();

  return (data as GameRow[])
    .filter(
      (row) =>
        row.storage_path && row.storage_path.toLowerCase().endsWith('.html'),
    )
    .map((row) => ({
      id: String(row.id),
      title: row.name,
      playUrl: getGamePublicUrl(row.storage_path!),
      storageBaseUrl,
    }));
}

function getGamesStorageBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  if (!url) return '';
  return `${url}/storage/v1/object/public/games/`;
}
