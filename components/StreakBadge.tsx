// v1.1.0 - Streak Tracking
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useStreak } from '@/hooks/useStreak';

type Props = {
  trigger?: any;
};

export const StreakBadge: React.FC<Props> = ({ trigger }) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { currentStreak } = useStreak(trigger);

  if (currentStreak === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.cardBackground, borderColor: colors.separator }]}>
        <Text style={[styles.text, { color: colors.icon }]}>Start your streak!</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.cardBackground, borderColor: colors.separator }]}>
      <Text style={[styles.text, { color: colors.text }]}>
        🔥 {currentStreak} day streak
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
