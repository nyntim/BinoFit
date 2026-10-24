import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Fonts } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useRestTimer } from '@/hooks/useRestTimer';
import { formatDuration } from '@/lib/units';

/**
 * The running rest at the top of the live session on an ink surface: "Rest · <exercise>", the
 * countdown, -15, +15 and Skip. Renders nothing when no rest is running.
 */
export function RestBanner() {
  const { timer, remaining, add, subtract, skip } = useRestTimer();
  const page = useThemeColor({}, 'background');
  const ink = useThemeColor({}, 'text');
  if (!timer) return null;

  const label = timer.exerciseName ? `Rest · ${timer.exerciseName}` : 'Rest';
  const buttons: { label: string; a11y: string; onPress: () => void; solid?: boolean }[] = [
    { label: '−15', a11y: 'Subtract 15 seconds', onPress: subtract },
    { label: '+15', a11y: 'Add 15 seconds', onPress: add },
    { label: 'Skip', a11y: 'Skip rest', onPress: skip, solid: true },
  ];

  return (
    <Card tone="ink" padding="none" style={styles.banner}>
      <View
        style={styles.texts}
        accessible
        accessibilityRole="timer"
        accessibilityLabel={`Rest, ${formatDuration(remaining)} left${timer.exerciseName ? `, ${timer.exerciseName}` : ''}`}
      >
        <Text style={[styles.label, { color: page }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.time, { color: page }]}>{formatDuration(remaining)}</Text>
      </View>
      {buttons.map((b) => (
        <Pressable
          key={b.label}
          onPress={b.onPress}
          accessibilityRole="button"
          accessibilityLabel={b.a11y}
          style={({ pressed }) => [styles.button, b.solid && { backgroundColor: page }, pressed && { opacity: 0.7 }]}
        >
          {/* The translucent look: a page-colored layer at low opacity over the ink surface */}
          {b.solid ? null : <View style={[StyleSheet.absoluteFill, styles.layer, { backgroundColor: page }]} />}
          <Text style={[styles.buttonText, { color: b.solid ? ink : page }]}>{b.label}</Text>
        </Pressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    borderRadius: 18,
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 10,
  },
  texts: { flexGrow: 1, flexBasis: 100, minWidth: 0 },
  label: { fontSize: 12, fontWeight: '600', opacity: 0.75 },
  time: { fontFamily: Fonts.rounded, fontSize: 30, lineHeight: 34, fontWeight: '800', fontVariant: ['tabular-nums'] },
  button: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 12,
    borderRadius: 11,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  layer: { opacity: 0.2 },
  buttonText: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
