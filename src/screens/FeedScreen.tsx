import React from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { GameCard, type Game } from '../component/GameCard';

type FeedScreenProps = {
  games: Game[];
};

export function FeedScreen({ games }: FeedScreenProps) {
  const { height } = useWindowDimensions();
  const [pageHeight, setPageHeight] = React.useState<number>(0);

  const onLayout = React.useCallback((e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.height);
    if (next > 0) setPageHeight(next);
  }, []);

  const effectiveHeight = pageHeight || height;

  if (!games.length) {
    return (
      <View style={styles.empty} onLayout={onLayout}>
        <Text style={styles.emptyTitle}>등록된 게임이 없습니다</Text>
        <Text style={styles.emptySub}>
          Supabase games 테이블·Storage에 게임을 추가해 주세요.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root} onLayout={onLayout}>
      <FlatList
        data={games}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <GameCard game={item} height={effectiveHeight} />
        )}
        pagingEnabled
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        snapToInterval={effectiveHeight}
        snapToAlignment="start"
        disableIntervalMomentum
        getItemLayout={(_, index) => ({
          length: effectiveHeight,
          offset: effectiveHeight * index,
          index,
        })}
        removeClippedSubviews
        initialNumToRender={2}
        windowSize={3}
        style={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0E0E0E' },
  list: { flex: 1 },
  empty: {
    flex: 1,
    backgroundColor: '#0E0E0E',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  emptySub: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
