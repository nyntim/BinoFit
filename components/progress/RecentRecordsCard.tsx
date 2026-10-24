import { Pressable, StyleSheet, View } from 'react-native';
import { ProgressCardHeader } from '@/components/progress/ProgressCardHeader';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/Card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import { usePreferences } from '@/hooks/usePreferences';
import { formatShortDate } from '@/lib/workouts/format';
import {
  formatRecordValue,
  recordKindLabel,
  type RecentRecord,
} from '@/lib/workouts/progress';

type Props = {
  records: RecentRecord[];
  onPressRecord: (workoutId: string) => void;
};

export function RecentRecordsCard({ records, onPressRecord }: Props) {
  const ember = useThemeColor({}, 'ember');
  const separator = useThemeColor({}, 'separator');
  const { weightUnit } = usePreferences();

  return (
    <Card padding="none" style={styles.card}>
      <View style={styles.header}>
        <ProgressCardHeader label="Recent records" />
      </View>
      {records.length === 0 ? (
        <ThemedText type="caption" style={styles.empty}>
          No records yet.
        </ThemedText>
      ) : (
        records.map((r) => {
          const kindLabel = recordKindLabel(r.kind);
          const valueLabel = formatRecordValue(r, weightUnit);
          const dateLabel = formatShortDate(r.date);
          return (
            <Pressable
              key={`${r.exerciseId}:${r.kind}`}
              onPress={() => onPressRecord(r.workoutId)}
              accessibilityRole="button"
              accessibilityLabel={[r.exerciseName, kindLabel, valueLabel, dateLabel].join(', ')}
              style={({ pressed }) => [
                styles.row,
                { borderTopColor: separator },
                pressed && { opacity: 0.85 },
              ]}
            >
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <IconSymbol name="star.fill" size={16} color={ember} />
              </View>
              <View style={styles.main}>
                <ThemedText type="body" style={styles.name} numberOfLines={1}>
                  {r.exerciseName}
                </ThemedText>
                <ThemedText type="caption" numberOfLines={1}>
                  {`${kindLabel} · ${dateLabel}`}
                </ThemedText>
              </View>
              <ThemedText type="body" style={styles.value}>
                {valueLabel}
              </ThemedText>
            </Pressable>
          );
        })
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  header: { paddingTop: 16, paddingHorizontal: 18, paddingBottom: 6 },
  empty: { paddingHorizontal: 18, paddingBottom: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  main: { flex: 1, minWidth: 0 },
  name: { fontWeight: '600' },
  value: { fontWeight: '600', fontVariant: ['tabular-nums'], flexShrink: 0, maxWidth: '40%', textAlign: 'right' },
});
