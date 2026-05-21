import Constants from 'expo-constants';

/** SGS 기본 포트 (macOS AirPlay가 5000 사용 → 5001) */
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

/** SGC → SGS API 베이스 URL */
export function getApiBase(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;

  if (__DEV__) {
    const devHost = resolveExpoDevHost();
    if (devHost) {
      return `http://${devHost}:${SGS_PORT}`;
    }
  }

  return `http://127.0.0.1:${SGS_PORT}`;
}
