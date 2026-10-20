import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useActiveWorkout } from '@/hooks/useActiveWorkout';
import { useNow } from '@/hooks/useNow';
import { useRestTimer } from '@/hooks/useRestTimer';
import { formatDuration } from '@/lib/units';
import { workoutDisplayName } from '@/lib/workouts/format';

/** Elapsed time of a session in seconds (never negative). */
export function elapsedSeconds(startedAt: string | null, nowMs: number): number {
  if (!startedAt) return 0;
  const start = new Date(startedAt).getTime();
  return Number.isNaN(start) ? 0 : Math.max(0, Math.floor((nowMs - start) / 1000));
}

type Props = {
  /** Extra text after the elapsed time. Defaults to the running rest ("Rest 1:24"). */
  detail?: string | null;
  nativeAccessory?: boolean;
  /** Outer fallback banner already owns its material. Ignored by the native accessory. */
  transparentContent?: boolean;
};

/**
 * The minimized live session, shown above the tab bar on every tab: name and elapsed time.
 * Tap opens the session. Renders nothing when no workout is active.
 */
export function ActiveWorkoutBar({ detail, nativeAccessory = false, transparentContent = false }: Props) {
  const { workout } = useActiveWorkout();
  const rest = useRestTimer();
  const now = useNow(1000, !!workout);
  const card = useThemeColor({}, 'cardBackground');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'background');
  const separator = useThemeColor({}, 'separator');
  if (!workout) return null;

  const elapsed = formatDuration(elapsedSeconds(workout.started_at, now));
  const shownDetail =
    detail !== undefined
      ? detail
      : rest.timer && rest.timer.workoutId === workout.id
        ? `Rest ${formatDuration(rest.remaining)}`
        : null;
  return (
    <Pressable
      onPress={() => router.push('/workout/session')}
      accessibilityRole="button"
      accessibilityLabel="Open workout"
      accessibilityHint={shownDetail?.startsWith('Rest') ? 'Resting. Opens the live session' : 'Opens the live session'}
      style={[styles.bar, nativeAccessory ? styles.nativeAccessory : transparentContent ? { backgroundColor: 'transparent', borderTopWidth: 0 } : { backgroundColor: card, borderTopColor: separator }]}
    >
      <View style={[styles.icon, { backgroundColor: tint }]}>
        <IconSymbol name="dumbbell.fill" size={20} color={onTint} />
      </View>
      <View style={styles.texts}>
        <Text style={[styles.title, { color: text }]} numberOfLines={1}>
          {workoutDisplayName(workout)}
        </Text>
        <Text style={[styles.subtitle, { color: muted }]} numberOfLines={1}>
          {shownDetail ? `${elapsed} · ${shownDetail}` : elapsed}
        </Text>
      </View>
      <IconSymbol name="chevron.up" size={22} color={muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 56,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  nativeAccessory: { borderTopWidth: 0, paddingVertical: 4, minHeight: 44 },
  icon: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '600' },
  subtitle: { fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'] },
});
