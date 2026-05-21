import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export type NavbarTab = 'games' | 'create';

type NavbarProps = {
  active?: NavbarTab;
  onPressGames?: () => void;
  onPressCreate?: () => void;
};

function TabButton({
  label,
  isActive,
  onPress,
}: {
  label: string;
  isActive: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tabButton,
        pressed && styles.tabButtonPressed,
      ]}
    >
      <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
        {label}
      </Text>
      <View style={[styles.indicator, isActive && styles.indicatorActive]} />
    </Pressable>
  );
}

export function Navbar({
  active = 'games',
  onPressGames,
  onPressCreate,
}: NavbarProps) {
  return (
    <View style={styles.root}>
      <TabButton
        label="Games"
        isActive={active === 'games'}
        onPress={onPressGames}
      />
      <TabButton
        label="Create"
        isActive={active === 'create'}
        onPress={onPressCreate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.18)',
    backgroundColor: '#121212',
    paddingBottom: 10,
    paddingTop: 10,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  tabButtonPressed: {
    opacity: 0.85,
  },
  tabLabel: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 14,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
  indicator: {
    marginTop: 6,
    height: 3,
    width: 18,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  indicatorActive: {
    backgroundColor: '#FFFFFF',
  },
});
