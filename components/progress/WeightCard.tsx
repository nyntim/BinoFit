import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { format, isToday, parseISO } from 'date-fns';
import { WeightEntrySheet } from '@/components/progress/WeightEntrySheet';
import { useThemeColor } from '@/hooks/use-theme-color';
import { usePreferences } from '@/hooks/usePreferences';
import { useWeightEntries } from '@/hooks/useWeightEntries';
import { formatWeightWithUnit } from '@/lib/units';
import { formatWeightChange } from '@/lib/weight';
import type { WeightEntry } from '@/lib/types';

const RECENT_DAYS = 5;

function dayLabel(date: string): string {
  const d = parseISO(date);
  return isToday(d) ? 'Today' : format(d, 'EEE d MMM');
}

/** Latest weight, change since the previous day logged, and the last few days. */
export function WeightCard() {
  const card = useThemeColor({}, 'cardBackground');
  const text = useThemeColor({}, 'text');
  const icon = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const background = useThemeColor({}, 'background');
  const border = useThemeColor({}, 'fieldBorder');
  const { weightUnit: unit } = usePreferences();
  const { days, status, reload } = useWeightEntries(RECENT_DAYS);

  const [sheet, setSheet] = useState<{
    open: boolean;
    entry: WeightEntry | null;
  }>({
    open: false,
    entry: null,
  });
  const openNew = () => setSheet({ open: true, entry: null });
  const openEdit = (entry: WeightEntry) => setSheet({ open: true, entry });
  const closeSheet = () => setSheet((s) => ({ ...s, open: false }));

  const latest = days[0] ?? null;
  const previous = days[1] ?? null;

  return (
    <View style={[styles.card, { backgroundColor: card }]}>
      <View style={styles.header}>
        <Text style={[styles.heading, { color: text }]} accessibilityRole="header">
          Weight
        </Text>
        {latest && (
          <TouchableOpacity
            style={styles.textButton}
            onPress={openNew}
            accessibilityRole="button"
            accessibilityLabel="Log weight"
          >
            <Text style={[styles.textButtonLabel, { color: tint }]}>Log weight</Text>
          </TouchableOpacity>
        )}
      </View>

      {status === 'loading' && <ActivityIndicator color={icon} style={styles.loading} />}

      {status === 'error' && (
        <View style={styles.message}>
          <Text style={[styles.body, { color: text }]}>Couldn&apos;t load weight.</Text>
          <TouchableOpacity
            style={styles.textButton}
            onPress={reload}
            accessibilityRole="button"
            accessibilityLabel="Retry"
          >
            <Text style={[styles.textButtonLabel, { color: tint }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {status === 'ready' && !latest && (
        <View style={styles.message}>
          <Text style={[styles.body, { color: text }]}>No weight logged yet.</Text>
          <Text style={[styles.caption, { color: icon }]}>Weight you log appears here.</Text>
          <TouchableOpacity
            style={[styles.primary, { backgroundColor: tint }]}
            onPress={openNew}
            accessibilityRole="button"
            accessibilityLabel="Log weight"
          >
            <Text style={[styles.primaryText, { color: background }]}>Log weight</Text>
          </TouchableOpacity>
        </View>
      )}

      {status === 'ready' && latest && (
        <>
          <TouchableOpacity
            onPress={() => openEdit(latest)}
            accessibilityRole="button"
            accessibilityLabel={`${dayLabel(latest.date)}, ${formatWeightWithUnit(latest.weight_kg, unit)}. Edit`}
          >
            <Text style={[styles.value, { color: text }]}>
              {formatWeightWithUnit(latest.weight_kg, unit)}
            </Text>
            <Text style={[styles.caption, { color: icon }]}>{dayLabel(latest.date)}</Text>
          </TouchableOpacity>
          {previous && (
            <Text style={[styles.caption, { color: icon }]}>
              {formatWeightChange(latest.weight_kg, previous.weight_kg, unit)} since{' '}
              {format(parseISO(previous.date), 'd MMM')}
            </Text>
          )}

          {days.length > 1 && (
            <View style={styles.list}>
              {days.slice(1).map((entry, i) => (
                <TouchableOpacity
                  key={entry.id}
                  style={[
                    styles.row,
                    i > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: border,
                    },
                  ]}
                  onPress={() => openEdit(entry)}
                  accessibilityRole="button"
                  accessibilityLabel={`${dayLabel(entry.date)}, ${formatWeightWithUnit(entry.weight_kg, unit)}. Edit`}
                >
                  <Text style={[styles.rowDate, { color: icon }]}>{dayLabel(entry.date)}</Text>
                  <Text style={[styles.rowValue, { color: text }]}>
                    {formatWeightWithUnit(entry.weight_kg, unit)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      )}

      <WeightEntrySheet
        visible={sheet.open}
        entry={sheet.entry}
        onClose={closeSheet}
        onChanged={reload}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: { fontSize: 17, fontWeight: '600' },
  textButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  textButtonLabel: { fontSize: 15, fontWeight: '600' },
  loading: { paddingVertical: 24 },
  message: { gap: 4, paddingTop: 4 },
  body: { fontSize: 15 },
  caption: { fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
  primary: {
    minHeight: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  primaryText: { fontSize: 17, fontWeight: '600' },
  value: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  list: { marginTop: 12 },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowDate: { fontSize: 13 },
  rowValue: { fontSize: 15, fontWeight: '400', fontVariant: ['tabular-nums'] },
});
