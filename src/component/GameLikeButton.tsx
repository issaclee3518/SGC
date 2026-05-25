import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type GameLikeButtonProps = {
  likeCount: number;
  likedByMe: boolean;
  onPress: () => void;
};

export function GameLikeButton({
  likeCount,
  likedByMe,
  onPress,
}: GameLikeButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={likedByMe ? '좋아요 취소' : '좋아요'}
    >
      <Ionicons
        name={likedByMe ? 'heart' : 'heart-outline'}
        size={28}
        color={likedByMe ? '#FF3B30' : '#FFFFFF'}
      />
      <Text style={[styles.count, likedByMe && styles.countLiked]}>
        {likeCount}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    padding: 4,
    minWidth: 36,
  },
  pressed: { opacity: 0.85 },
  count: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  countLiked: {
    color: '#FF3B30',
  },
});
