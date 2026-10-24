// v1.1.0 - Streak Tracking
import React from 'react';
import { useRouter } from 'expo-router';
import { Chip } from '@/components/ui/Chip';
import { useStreak } from '@/hooks/useStreak';

type Props = {
  trigger?: unknown;
};

/** Ember streak chip that opens Progress; a neutral prompt while there is no streak. */
export const StreakBadge: React.FC<Props> = ({ trigger }) => {
  const router = useRouter();
  const { currentStreak } = useStreak(trigger);

  if (currentStreak === 0) return <Chip size="sm" label="Start your streak!" />;

  return (
    <Chip
      tone="ember"
      size="sm"
      icon="flame.fill"
      role="button"
      label={`${currentStreak} ${currentStreak === 1 ? 'day' : 'days'}`}
      accessibilityLabel={`${currentStreak} day logging streak`}
      onPress={() => router.navigate('/(tabs)/progress')}
    />
  );
};
