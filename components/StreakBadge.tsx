// v1.1.0 - Streak Tracking
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useStreak } from '@/hooks/useStreak';
import { IconSymbol } from '@/components/ui/icon-symbol';

type Props = {
  trigger?: any;
};

export const StreakBadge: React.FC<Props> = ({ trigger }) => {
  const cardBackground = useThemeColor({}, 'cardBackground');
  const separator = useThemeColor({}, 'separator');
  const icon = useThemeColor({}, 'icon');
  const text = useThemeColor({}, 'text');
  const streak = useThemeColor({}, 'streak');
  const { currentStreak } = useStreak(trigger);

  if (currentStreak === 0) {
    return (
      <View style={[styles.container, { backgroundColor: cardBackground, borderColor: separator }]}>
        <Text numberOfLines={1} style={[styles.text, { color: icon }]}>Start your streak!</Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: cardBackground, borderColor: separator }]}
      accessible
      accessibilityLabel={`${currentStreak} day streak`}
    >
      <IconSymbol name="flame.fill" size={12} color={streak} />
      <Text numberOfLines={1} style={[styles.text, { color: text }]}>
        {currentStreak} day streak
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexShrink: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
  },
  text: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
  },
});
