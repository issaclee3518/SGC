import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useGameLeaderboard } from '../hooks/useGameLeaderboard';

type GameLeaderboardPanelProps = {
  gameId: string;
  /** 점수 제출 직후 목록 다시 불러오기 */
  refreshTick?: number;
};

function formatScore(score: number): string {
  if (Number.isInteger(score)) return String(score);
  return score.toFixed(1);
}

export function GameLeaderboardPanel({
  gameId,
  refreshTick = 0,
}: GameLeaderboardPanelProps) {
  const [open, setOpen] = React.useState(false);
  const { entries, loading, error } = useGameLeaderboard(
    gameId,
    open,
    refreshTick,
  );

  return (
    <View style={styles.anchor} pointerEvents="box-none">
      <Pressable
        style={({ pressed }) => [styles.toggleBtn, pressed && styles.pressed]}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={open ? '랭킹 닫기' : '랭킹 보기'}
      >
        <Ionicons
          name={open ? 'trophy' : 'trophy-outline'}
          size={28}
          color={open ? '#FFD60A' : '#FFFFFF'}
        />
      </Pressable>

      {open ? (
        <View style={styles.panelFloat} pointerEvents="box-none">
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>실시간 TOP5</Text>
            {loading && entries.length === 0 ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : null}
            {error ? (
              <Text style={styles.errorText} numberOfLines={2}>
                {error}
              </Text>
            ) : null}
            {!loading && !error && entries.length === 0 ? (
              <Text style={styles.emptyText}>아직 기록이 없습니다</Text>
            ) : null}
            {entries.map((row) => (
              <View key={row.userId} style={styles.row}>
                <Text style={styles.rank}>{row.rank}</Text>
                <Text style={styles.userId} numberOfLines={1}>
                  {row.userLabel}
                </Text>
                <Text style={styles.score}>{formatScore(row.score)}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const ICON_SLOT = 36;

const styles = StyleSheet.create({
  anchor: {
    position: 'relative',
    width: ICON_SLOT,
    height: ICON_SLOT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtn: {
    padding: 4,
  },
  pressed: { opacity: 0.85 },
  panelFloat: {
    position: 'absolute',
    right: 0,
    bottom: ICON_SLOT,
    marginBottom: 8,
    zIndex: 20,
  },
  panel: {
    minWidth: 220,
    maxWidth: 280,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  panelTitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    gap: 8,
  },
  rank: {
    width: 18,
    color: '#FFD60A',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  userId: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Menlo',
  },
  score: {
    color: '#4ADE80',
    fontSize: 13,
    fontWeight: '800',
    minWidth: 48,
    textAlign: 'right',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    paddingVertical: 4,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 11,
    paddingVertical: 4,
  },
});
