import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import type { Game } from './src/component/GameCard';
import { Navbar, type NavbarTab } from './src/component';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { fetchGames, fetchMyGames } from './src/lib/gameService';
import {
  optimisticLikeToggle,
  toggleGameLike,
  type LikeMeta,
} from './src/lib/likeService';
import { CreatScreen } from './src/screens/CreatScreen';
import { FeedScreen } from './src/screens/FeedScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';

function patchGameLike(
  list: Game[],
  gameId: string,
  meta: LikeMeta,
): Game[] {
  return list.map((g) =>
    g.id === gameId
      ? { ...g, likeCount: meta.likeCount, likedByMe: meta.likedByMe }
      : g,
  );
}

function MainApp() {
  const { session, isLoading, isAuthenticated } = useAuth();
  const [active, setActive] = React.useState<NavbarTab>('games');
  const [games, setGames] = React.useState<Game[]>([]);
  const [myGames, setMyGames] = React.useState<Game[]>([]);
  const likeRequestSeq = React.useRef<Record<string, number>>({});
  const likeInFlight = React.useRef<Set<string>>(new Set());

  const loadGames = React.useCallback(async () => {
    if (!session) return;
    try {
      const [all, mine] = await Promise.all([
        fetchGames(session.user.id),
        fetchMyGames(session.user.id),
      ]);
      setGames(all);
      setMyGames(mine);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      console.error('Error fetching games:', message);
    }
  }, [session]);

  React.useEffect(() => {
    if (isAuthenticated) {
      loadGames();
    } else {
      setGames([]);
      setMyGames([]);
    }
  }, [isAuthenticated, loadGames]);

  const handleToggleLike = React.useCallback(
    (gameId: string) => {
      if (!session?.user.id) return;
      if (likeInFlight.current.has(gameId)) return;

      likeInFlight.current.add(gameId);

      let rollback: LikeMeta | undefined;
      let found = false;

      setGames((prev) => {
        const game = prev.find((g) => g.id === gameId);
        if (!game) return prev;
        found = true;
        const before: LikeMeta = {
          likedByMe: game.likedByMe ?? false,
          likeCount: game.likeCount ?? 0,
        };
        rollback = before;
        const next = optimisticLikeToggle(before);
        return patchGameLike(prev, gameId, next);
      });

      if (!found || !rollback) {
        likeInFlight.current.delete(gameId);
        return;
      }

      const wasLiked = rollback.likedByMe;
      const seq = (likeRequestSeq.current[gameId] ?? 0) + 1;
      likeRequestSeq.current[gameId] = seq;

      void (async () => {
        try {
          const server = await toggleGameLike(
            Number(gameId),
            session.user.id,
            wasLiked,
          );
          if (likeRequestSeq.current[gameId] !== seq) return;
          setGames((prev) => patchGameLike(prev, gameId, server));
        } catch (error) {
          if (likeRequestSeq.current[gameId] !== seq) return;
          const revert = rollback;
          setGames((prev) => patchGameLike(prev, gameId, revert));
          const message =
            error instanceof Error ? error.message : '좋아요 처리 실패';
          console.error('toggle like:', message);
        } finally {
          likeInFlight.current.delete(gameId);
        }
      })();
    },
    [session],
  );

  if (isLoading) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color="#FFFFFF" size="large" />
      </View>
    );
  }

  if (!isAuthenticated || !session) {
    return <LoginScreen />;
  }

  const user = session.user;

  return (
    <>
      <View style={styles.content}>
        <View
          style={[styles.tabPane, active !== 'games' && styles.tabHidden]}
          pointerEvents={active === 'games' ? 'auto' : 'none'}
        >
          <FeedScreen
            games={games}
            onToggleLike={handleToggleLike}
          />
        </View>
        <View
          style={[styles.tabPane, active !== 'create' && styles.tabHidden]}
          pointerEvents={active === 'create' ? 'auto' : 'none'}
        >
          <CreatScreen onGameCreated={loadGames} />
        </View>
        <View
          style={[styles.tabPane, active !== 'profile' && styles.tabHidden]}
          pointerEvents={active === 'profile' ? 'auto' : 'none'}
        >
          <ProfileScreen key="profile" games={myGames} user={user} />
        </View>
      </View>

      <Navbar
        active={active}
        onPressGames={() => setActive('games')}
        onPressCreate={() => setActive('create')}
        onPressProfile={() => setActive('profile')}
      />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SafeAreaView style={styles.safe}>
          <MainApp />
          <StatusBar style="light" />
        </SafeAreaView>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0E0E0E' },
  boot: {
    flex: 1,
    backgroundColor: '#0E0E0E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    backgroundColor: '#0E0E0E',
  },
  tabPane: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
    backgroundColor: '#0E0E0E',
  },
  tabHidden: {
    opacity: 0,
    zIndex: -1,
  },
});
