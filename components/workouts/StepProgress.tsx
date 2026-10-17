import { StyleSheet, Text, View } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';

/** "Step n of N" with a 4px progress bar. */
export function StepProgress({ step, total }: { step: number; total: number }) {
  const muted = useThemeColor({}, 'icon');
  const track = useThemeColor({}, 'track');
  const tint = useThemeColor({}, 'tint');
  const pct = total > 0 ? Math.min(100, Math.max(0, (step / total) * 100)) : 0;

  return (
    <View style={styles.wrap} accessible accessibilityLabel={`Step ${step} of ${total}`}>
      <Text style={[styles.label, { color: muted }]}>{`Step ${step} of ${total}`}</Text>
      <View style={[styles.track, { backgroundColor: track }]}>
        <View style={[styles.fill, { backgroundColor: tint, width: `${pct}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingBottom: 8, gap: 6 },
  label: { fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'] },
  track: { height: 4, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 4 },
});
