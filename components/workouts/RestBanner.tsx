import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useRestTimer } from '@/hooks/useRestTimer';
import { formatDuration } from '@/lib/units';

/**
 * The running rest at the top of the live session: "Rest · <exercise>", the countdown, -15s, +15s and
 * Skip. Renders nothing when no rest is running.
 */
export function RestBanner() {
  const { timer, remaining, add, subtract, skip } = useRestTimer();
  const surface = useThemeColor({}, 'cardSecondary');
  const muted = useThemeColor({}, 'icon');
  const text = useThemeColor({}, 'text');
  const tint = useThemeColor({}, 'tint');
  const border = useThemeColor({}, 'fieldBorder');
  if (!timer) return null;

  const label = timer.exerciseName ? `Rest · ${timer.exerciseName}` : 'Rest';
  const buttons: { label: string; a11y: string; onPress: () => void }[] = [
    { label: '−15s', a11y: 'Subtract 15 seconds', onPress: subtract },
    { label: '+15s', a11y: 'Add 15 seconds', onPress: add },
    { label: 'Skip', a11y: 'Skip rest', onPress: skip },
  ];

  return (
    <View style={[styles.banner, { backgroundColor: surface }]}>
      <View
        style={styles.texts}
        accessible
        accessibilityRole="timer"
        accessibilityLabel={`Rest, ${formatDuration(remaining)} left${timer.exerciseName ? `, ${timer.exerciseName}` : ''}`}
      >
        <Text style={[styles.label, { color: muted }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.time, { color: text }]}>{formatDuration(remaining)}</Text>
      </View>
      {buttons.map((b) => (
        <Pressable
          key={b.label}
          onPress={b.onPress}
          accessibilityRole="button"
          accessibilityLabel={b.a11y}
          style={({ pressed }) => [styles.button, { borderColor: border }, pressed && { opacity: 0.6 }]}
        >
          <Text style={[styles.buttonText, { color: tint }]}>{b.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 12,
  },
  texts: { flexGrow: 1, flexBasis: 100, minWidth: 0 },
  label: { fontSize: 12, fontWeight: '500' },
  time: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  button: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
