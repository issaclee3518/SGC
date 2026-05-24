import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type GameLikeButtonProps = {
  likeCount: number;
  likedByMe: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export function GameLikeButton({
  likeCount,
  likedByMe,
  disabled,
  onPress,
}: GameLikeButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.wrap,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={likedByMe ? '좋아요 취소' : '좋아요'}
    >
      <View style={styles.iconRow}>
        {disabled ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Ionicons
            name={likedByMe ? 'heart' : 'heart-outline'}
            size={28}
            color={likedByMe ? '#FF3B30' : '#FFFFFF'}
          />
        )}
      </View>
      <Text style={[styles.count, likedByMe && styles.countLiked]}>
        {likeCount}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.7 },
  iconRow: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
