import { Pressable, StyleSheet, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';

type Props = {
  name: string;
  done: number;
  total: number;
  /** The previous performance of the first set ("115 × 8"); omitted when unknown. */
  last?: string | null;
  onPress: () => void;
};

/** A collapsed upcoming exercise in the live session: name, "0 of 3 sets · last 115 × 8" and a dot per set. Tap shows the sets. */
export function ExerciseSummaryCard({ name, done, total, last, onPress }: Props) {
  const tint = useThemeColor({}, 'tint');
  const track = useThemeColor({}, 'track');
  const caption = `${done} of ${total} sets${last ? ` · last ${last}` : ''}`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${done} of ${total} sets${last ? `, last ${last}` : ''}`}
      accessibilityHint="Shows the sets"
      accessibilityState={{ expanded: false }}
    >
      <Card padding="compact" style={styles.card}>
        <View style={styles.copy}>
          <ThemedText type="body" style={styles.name}>{name}</ThemedText>
          <ThemedText type="caption" style={styles.caption}>{caption}</ThemedText>
        </View>
        <View style={styles.dots} accessible={false} importantForAccessibility="no-hide-descendants">
          {Array.from({ length: Math.min(total, 12) }, (_, i) => (
            <View key={i} testID="set-dot" style={[styles.dot, { backgroundColor: i < done ? tint : track }]} />
          ))}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  name: { fontWeight: '600' },
  caption: { fontVariant: ['tabular-nums'] },
  dots: { flexDirection: 'row', gap: 4, flexShrink: 0 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
