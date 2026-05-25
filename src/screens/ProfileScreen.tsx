import type { User } from '@supabase/supabase-js';
import React from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Game } from '../component/GameCard';
import {
  avatarUrlFromUser,
  displayNameFromUser,
  signOut,
} from '../lib/authService';
import { useAuth } from '../context/AuthContext';

type ProfileScreenProps = {
  games: Game[];
  user: User;
};

function GameRow({ game }: { game: Game }) {
  const [iconFailed, setIconFailed] = React.useState(false);
  const showIcon = !!game.iconUrl && !iconFailed;

  React.useEffect(() => {
    setIconFailed(false);
  }, [game.iconUrl]);

  return (
    <View style={styles.gameRow}>
      {showIcon ? (
        <Image
          source={{ uri: game.iconUrl }}
          style={styles.gameThumbImage}
          resizeMode="cover"
          onError={() => setIconFailed(true)}
        />
      ) : (
        <View style={styles.gameThumb} />
      )}
      <View style={styles.gameInfo}>
        <Text style={styles.gameTitle} numberOfLines={1}>
          {game.title}
        </Text>
      </View>
    </View>
  );
}

export function ProfileScreen({ games, user }: ProfileScreenProps) {
  const { setSession } = useAuth();
  const displayName = displayNameFromUser(user);
  const avatarUrl = avatarUrlFromUser(user);
  const initial = displayName.charAt(0).toUpperCase();

  const onSignOut = async () => {
    try {
      await signOut();
      setSession(null);
    } catch (e) {
      Alert.alert(
        '로그아웃 실패',
        e instanceof Error ? e.message : '다시 시도해 주세요.',
      );
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
        )}
        <Text style={styles.displayName}>{displayName}</Text>
        <Text style={styles.handle}>{user.email}</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{games.length}</Text>
          <Text style={styles.statLabel}>내 게임</Text>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.signOutBtn, pressed && styles.pressed]}
        onPress={() => void onSignOut()}
      >
        <Text style={styles.signOutBtnText}>로그아웃</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>만든 게임</Text>
      {games.length === 0 ? (
        <Text style={styles.empty}>아직 완성한 게임이 없습니다.</Text>
      ) : (
        games.map((game) => (
          <GameRow key={game.id} game={game} />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0E0E0E' },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
    marginBottom: 14,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  displayName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  handle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    marginBottom: 16,
  },
  stat: { alignItems: 'center' },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
  },
  signOutBtn: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginBottom: 12,
  },
  signOutBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  pressed: { opacity: 0.85 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  empty: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
  },
  gameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  gameThumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  gameThumbImage: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  gameInfo: { flex: 1 },
  gameTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
