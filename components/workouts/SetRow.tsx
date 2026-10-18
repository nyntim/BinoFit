import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { NumericCell } from '@/components/workouts/NumericCell';
import { columnStyle } from '@/components/workouts/SetTableHeader';
import { useThemeColor } from '@/hooks/use-theme-color';
import { distanceUnitFor } from '@/lib/units';
import type { WeightUnit, WorkoutSet } from '@/lib/types';
import {
  cellText,
  paceText,
  type CellKey,
  type SetBadge,
  type SetColumn,
} from '@/lib/workouts/editor-state';

type Props = {
  columns: SetColumn[];
  set: WorkoutSet;
  badge: SetBadge;
  unit: WeightUnit;
  /** The Previous column text (null shows a dash). */
  previousText: string | null;
  /** The previous set at this index, shown as placeholders in empty cells. */
  previousSet: WorkoutSet | null;
  /** True when this set beat at least one personal record for its exercise. Default false. */
  personalRecord?: boolean;
  onChangeCell: (key: CellKey, text: string) => void;
  /** Opens the set type sheet (change type, delete). */
  onPressBadge: () => void;
  /** Present when the table has a Done column. */
  onToggleDone?: () => void;
};

const CELL_KEYBOARD: Record<CellKey, 'decimal-pad' | 'number-pad'> = {
  weight: 'decimal-pad',
  reps: 'number-pad',
  duration: 'number-pad',
  distance: 'decimal-pad',
  rpe: 'decimal-pad',
};

/** Spoken name of a cell, e.g. "weight", "reps", "distance in km", "time". */
function cellLabel(c: SetColumn, unit: WeightUnit): string {
  if (c.accessibilityLabel) return c.accessibilityLabel.charAt(0).toLowerCase() + c.accessibilityLabel.slice(1);
  switch (c.key) {
    case 'weight':
      return 'weight';
    case 'distance':
      return `distance in ${distanceUnitFor(unit)}`;
    case 'duration':
      return 'time';
    case 'rpe':
      return 'RPE';
    default:
      return c.label.toLowerCase();
  }
}

export function SetRow({
  columns,
  set,
  badge,
  unit,
  previousText,
  previousSet,
  personalRecord = false,
  onChangeCell,
  onPressBadge,
  onToggleDone,
}: Props) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const background = useThemeColor({}, 'background');
  const fieldBorder = useThemeColor({}, 'fieldBorder');
  const done = !!set.completed_at;

  return (
    <View style={styles.row}>
      {columns.map((c) => {
        const style = columnStyle(c);
        switch (c.key) {
          case 'badge':
            return (
              <Pressable
                key={c.key}
                onPress={onPressBadge}
                accessibilityRole="button"
                accessibilityLabel={`${badge.accessibilityLabel}${personalRecord ? ', personal record' : ''}. Change type or delete`}
                style={[styles.badge, style]}
              >
                <Text maxFontSizeMultiplier={1.3} style={[styles.badgeText, { color: badge.special ? muted : text }]}>{badge.label}</Text>
                {personalRecord ? (
                  <Text maxFontSizeMultiplier={1.3} style={[styles.prTag, { color: muted }]}>
                    PR
                  </Text>
                ) : null}
              </Pressable>
            );
          case 'previous':
            return (
              <Text key={c.key} numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.previous, style, { color: muted }]}>
                {previousText ?? '-'}
              </Text>
            );
          case 'pace':
            return (
              <Text key={c.key} numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.pace, style, { color: text }]}>
                {paceText(set, unit)}
              </Text>
            );
          case 'done':
            return (
              <View key={c.key} style={[styles.doneWrap, style]}>
                <Pressable
                  onPress={onToggleDone}
                  hitSlop={4}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done }}
                  accessibilityLabel={done ? `${badge.accessibilityLabel} done` : `Complete ${badge.accessibilityLabel.toLowerCase()}`}
                  style={[
                    styles.check,
                    done ? { backgroundColor: tint, borderColor: tint } : { borderColor: fieldBorder },
                  ]}
                >
                  {done ? <IconSymbol name="checkmark" size={18} color={background} /> : null}
                </Pressable>
              </View>
            );
          default: {
            const key = c.key;
            return (
              <View key={c.key} style={style}>
                <NumericCell
                  value={cellText(set, key, unit)}
                  placeholder={previousSet ? cellText(previousSet, key, unit) : undefined}
                  keyboardType={CELL_KEYBOARD[key]}
                  accessibilityLabel={`${badge.accessibilityLabel} ${cellLabel(c, unit)}`}
                  onCommit={(t) => onChangeCell(key, t)}
                />
              </View>
            );
          }
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  badge: { height: 44, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  prTag: { fontSize: 12, fontWeight: '500', lineHeight: 13 },
  previous: { fontSize: 13, fontVariant: ['tabular-nums'] },
  pace: { fontSize: 15, fontWeight: '600', textAlign: 'right', fontVariant: ['tabular-nums'] },
  doneWrap: { alignItems: 'center', justifyContent: 'center' },
  check: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
