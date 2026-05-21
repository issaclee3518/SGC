import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import type { Game } from './src/component/GameCard';
import { Navbar, type NavbarTab } from './src/component';
import { fetchGames } from './src/lib/gameService';
import { CreatScreen } from './src/screens/CreatScreen';
import { FeedScreen } from './src/screens/FeedScreen';

export default function App() {
  const [active, setActive] = useState<NavbarTab>('games');
  const [games, setGames] = useState<Game[]>([]);

  const loadGames = React.useCallback(async () => {
    try {
      const items = await fetchGames();
      setGames(items);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      console.error('Error fetching games:', message);
    }
  }, []);

  useEffect(() => {
    loadGames();
  }, [loadGames]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.content}>
          {active === 'games' ? (
            <FeedScreen games={games} />
          ) : (
            <CreatScreen onGameCreated={loadGames} />
          )}
        </View>

        <Navbar
          active={active}
          onPressGames={() => setActive('games')}
          onPressCreate={() => setActive('create')}
        />
      </View>
      <StatusBar style="light" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0E0E0E' },
  container: { flex: 1, backgroundColor: '#0E0E0E' },
  content: {
    flex: 1,
    backgroundColor: '#0E0E0E',
  },
});
