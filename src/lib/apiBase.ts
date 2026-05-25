import Constants from 'expo-constants';

/** SGS 기본 포트 — __DEV__ 에서 EXPO_PUBLIC_API_URL 미설정 시 로컬 SGS용 */
export const SGS_PORT = 5001;

function resolveExpoDevHost(): string | null {
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    return hostUri.split(':')[0] ?? null;
  }

  const debuggerHost =
    Constants.expoGoConfig?.debuggerHost ??
    (Constants as { manifest?: { debuggerHost?: string } }).manifest
      ?.debuggerHost;

  if (debuggerHost) {
    return debuggerHost.split(':')[0] ?? null;
  }

  return null;
}

/** SGC → SGS API 베이스 URL (EXPO_PUBLIC_API_URL 우선) */
export function getApiBase(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;

  if (__DEV__) {
    const devHost = resolveExpoDevHost();
    if (devHost) {
      return `http://${devHost}:${SGS_PORT}`;
    }
    return `http://127.0.0.1:${SGS_PORT}`;
  }

  throw new Error(
    'EXPO_PUBLIC_API_URL is not set. Add it to .env.local (e.g. https://sgs-gl6p.onrender.com)',
  );
}
