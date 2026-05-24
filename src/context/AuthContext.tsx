import type { Session } from '@supabase/supabase-js';
import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { getSession, onAuthStateChange } from '../lib/authService';
import { supabase } from '../lib/supabase';

type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setSession: (session: Session | null) => void;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;

    getSession()
      .then((s) => {
        if (mounted) setSession(s);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    const unsub = onAuthStateChange((s) => {
      if (mounted) setSession(s);
    });

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });

    return () => {
      mounted = false;
      unsub();
      sub.remove();
    };
  }, []);

  const value = React.useMemo(
    () => ({
      session,
      isLoading,
      isAuthenticated: !!session,
      setSession,
    }),
    [session, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
