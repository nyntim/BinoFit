import { Pressable, StyleSheet, Text, View } from 'react-native';
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
  const card = useThemeColor({}, 'cardBackground');
  const text = useThemeColor({}, 'text');
  const icon = useThemeColor({}, 'icon');
  const separator = useThemeColor({}, 'separator');
  const { weightUnit } = usePreferences();

  return (
    <View style={[styles.card, { backgroundColor: card }]}>
      <Text style={[styles.title, { color: text }]} accessibilityRole="header">
        Recent records
      </Text>
      {records.length === 0 ? (
        <Text style={[styles.empty, { color: icon }]}>No records yet.</Text>
      ) : (
        <View>
          {records.map((r, i) => {
            const last = i === records.length - 1;
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
                  pressed && { opacity: 0.85 },
                  !last && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: separator,
                  },
                ]}
              >
                <View style={styles.main}>
                  <Text style={[styles.name, { color: text }]} numberOfLines={1}>
                    {r.exerciseName}
                  </Text>
                  <Text style={[styles.kind, { color: icon }]} numberOfLines={1}>
                    {kindLabel}
                  </Text>
                </View>
                <View style={styles.side}>
                  <Text style={[styles.value, { color: text }]}>{valueLabel}</Text>
                  <Text style={[styles.date, { color: icon }]}>{dateLabel}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: 20, gap: 16 },
  title: { fontSize: 17, fontWeight: '600', lineHeight: 22 },
  empty: { fontSize: 12, lineHeight: 17 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 12,
    minHeight: 44,
  },
  main: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 15 },
  kind: { fontSize: 12 },
  side: { alignItems: 'flex-end', gap: 2, flexShrink: 0, maxWidth: '45%' },
  value: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  date: { fontSize: 12, fontVariant: ['tabular-nums'] },
});
