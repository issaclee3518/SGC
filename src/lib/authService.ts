import type { Session, User } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

const APP_SCHEME =
  Constants.expoConfig?.scheme ??
  (Constants.expoConfig?.extra as { scheme?: string } | undefined)?.scheme ??
  'scrollgame';

const REDIRECT_URI = `${APP_SCHEME}://google-auth`;

function extractTokensFromUrl(url: string): {
  access_token: string | null;
  refresh_token: string | null;
} {
  const parsed = new URL(url);
  const hash = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash;
  const params = new URLSearchParams(hash || parsed.search);
  return {
    access_token: params.get('access_token'),
    refresh_token: params.get('refresh_token'),
  };
}

/** Google OAuth (Supabase Auth) — Expo WebBrowser */
export async function signInWithGoogle(): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: REDIRECT_URI,
      skipBrowserRedirect: true,
      queryParams: { prompt: 'consent' },
    },
  });

  if (error) throw error;
  if (!data.url) throw new Error('Google 로그인 URL을 받지 못했습니다.');

  const result = await WebBrowser.openAuthSessionAsync(
    data.url,
    REDIRECT_URI,
    { showInRecents: true },
  );

  if (result.type !== 'success' || !result.url) {
    throw new Error('Google 로그인이 취소되었습니다.');
  }

  const { access_token, refresh_token } = extractTokensFromUrl(result.url);
  if (!access_token || !refresh_token) {
    throw new Error('로그인 토큰을 받지 못했습니다. Supabase Redirect URL을 확인하세요.');
  }

  const { data: sessionData, error: sessionError } =
    await supabase.auth.setSession({ access_token, refresh_token });

  if (sessionError) throw sessionError;
  if (!sessionData.session) throw new Error('세션을 만들지 못했습니다.');

  return sessionData.session;
}

export function isInvalidRefreshTokenError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const msg = String((error as { message?: string }).message ?? '').toLowerCase();
  const code = String((error as { code?: string }).code ?? '').toLowerCase();
  return (
    code.includes('refresh') ||
    msg.includes('refresh token') ||
    msg.includes('invalid refresh')
  );
}

/** AsyncStorage에 남은 만료/삭제된 refresh token 제거 */
export async function clearStaleAuthSession(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    /* 이미 로컬 세션이 없을 수 있음 */
  }
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error && !isInvalidRefreshTokenError(error)) throw error;
}

/** 만료된 refresh token이면 로컬 세션만 지우고 null (LogBox 오류 방지) */
export async function getSession(): Promise<Session | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      if (isInvalidRefreshTokenError(error)) {
        await clearStaleAuthSession();
        return null;
      }
      throw error;
    }
    return data.session;
  } catch (e) {
    if (isInvalidRefreshTokenError(e)) {
      await clearStaleAuthSession();
      return null;
    }
    throw e;
  }
}

export function onAuthStateChange(
  callback: (session: Session | null) => void,
): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => data.subscription.unsubscribe();
}

export function displayNameFromUser(user: User | null | undefined): string {
  if (!user) return '게스트';
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const name =
    (meta?.full_name as string) ||
    (meta?.name as string) ||
    user.email?.split('@')[0];
  return name?.trim() || '사용자';
}

export function avatarUrlFromUser(user: User | null | undefined): string | null {
  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const url = meta?.avatar_url ?? meta?.picture;
  return typeof url === 'string' ? url : null;
}
