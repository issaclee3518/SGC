import { StatusBar } from 'expo-status-bar';
import React from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  View,
} from 'react-native';
import type { Game } from './src/component/GameCard';
import { Navbar, type NavbarTab } from './src/component';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { fetchGames, fetchMyGames } from './src/lib/gameService';
import { toggleGameLike } from './src/lib/likeService';
import { CreatScreen } from './src/screens/CreatScreen';
import { FeedScreen } from './src/screens/FeedScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';

function MainApp() {
  const { session, isLoading, isAuthenticated } = useAuth();
  const [active, setActive] = React.useState<NavbarTab>('games');
  const [games, setGames] = React.useState<Game[]>([]);
  const [myGames, setMyGames] = React.useState<Game[]>([]);
  const [likeBusyGameId, setLikeBusyGameId] = React.useState<string | null>(
    null,
  );

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
    async (gameId: string) => {
      if (!session?.user.id) return;
      const game = games.find((g) => g.id === gameId);
      if (!game || likeBusyGameId) return;

      setLikeBusyGameId(gameId);
      try {
        const next = await toggleGameLike(
          Number(gameId),
          session.user.id,
          game.likedByMe ?? false,
        );
        setGames((prev) =>
          prev.map((g) =>
            g.id === gameId
              ? { ...g, likeCount: next.likeCount, likedByMe: next.likedByMe }
              : g,
          ),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '좋아요 처리 실패';
        console.error('toggle like:', message);
      } finally {
        setLikeBusyGameId(null);
      }
    },
    [games, likeBusyGameId, session],
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
        {active === 'games' ? (
          <FeedScreen
            games={games}
            onToggleLike={(id) => void handleToggleLike(id)}
            likeBusyGameId={likeBusyGameId}
          />
        ) : active === 'create' ? (
          <CreatScreen onGameCreated={loadGames} />
        ) : (
          <ProfileScreen
            games={myGames}
            onRefresh={loadGames}
            user={user}
          />
        )}
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
    <AuthProvider>
      <SafeAreaView style={styles.safe}>
        <MainApp />
        <StatusBar style="light" />
      </SafeAreaView>
    </AuthProvider>
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
});
