import { createClient } from '@supabase/supabase-js';

/**
 * Supabase 클라이언트 (앱당 1개).
 * 로그인/세션 저장은 아직 없음 — AsyncStorage는 Expo Go + v3 조합에서
 * "Native module is null" 오류가 나서 제외. 공개 테이블 조회만 사용.
 * 나중에 auth 추가 시: npx expo install @react-native-async-storage/async-storage
 * 후 auth.storage에 연결 (Expo 권장 2.x).
 */
export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);
