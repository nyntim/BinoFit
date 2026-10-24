import { StyleSheet, Text, View } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';

/** "Step n of N" caption for the builder header; the review step reads "Review". */
export function StepCaption({ step, total, review = false }: { step: number; total: number; review?: boolean }) {
  const muted = useThemeColor({}, 'icon');
  return (
    <Text style={[styles.label, { color: muted }]} accessible={false}>
      {review ? 'Review' : `Step ${step} of ${total}`}
    </Text>
  );
}

/** 4 px progress bar, announced as "Step n of N". */
export function StepBar({ step, total }: { step: number; total: number }) {
  const track = useThemeColor({}, 'track');
  const tint = useThemeColor({}, 'tint');
  const pct = total > 0 ? Math.min(100, Math.max(0, (step / total) * 100)) : 0;

  return (
    <View
      style={[styles.track, { backgroundColor: track }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${total}`}
      accessibilityValue={{ min: 1, max: total, now: step }}
    >
      <View style={[styles.fill, { backgroundColor: tint, width: `${pct}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'], textAlign: 'center' },
  track: { height: 4, borderRadius: 2, marginHorizontal: 16, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
});
