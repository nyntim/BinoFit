import { Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
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
  /** The set being worked in the live session: tinted row, tint-bordered cells. */
  active?: boolean;
};

const CELL_KEYBOARD: Record<CellKey, 'decimal-pad' | 'number-pad'> = {
  weight: 'decimal-pad',
  reps: 'number-pad',
  duration: 'number-pad',
  distance: 'decimal-pad',
  rpe: 'decimal-pad',
  rir: 'number-pad',
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
    case 'rir':
      return 'reps in reserve';
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
  active = false,
}: Props) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'onTint');
  const tintSoft = useThemeColor({}, 'tintSoft');
  const ember = useThemeColor({}, 'ember');
  const fieldBorder = useThemeColor({}, 'fieldBorder');
  const done = !!set.completed_at;

  return (
    <View style={[styles.row, active && { backgroundColor: tintSoft }]}>
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
                <ThemedText type="body" maxFontSizeMultiplier={1.3} style={[styles.badgeText, { color: badge.special ? muted : text }]}>{badge.label}</ThemedText>
                {personalRecord ? (
                  <View testID="record-star" accessible={false} importantForAccessibility="no-hide-descendants">
                    <IconSymbol name="star.fill" size={12} color={ember} />
                  </View>
                ) : null}
              </Pressable>
            );
          case 'previous':
            return (
              <ThemedText type="label" key={c.key} numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.previous, style, { color: muted }]}>
                {previousText ?? '-'}
              </ThemedText>
            );
          case 'pace':
            return (
              <ThemedText type="stat" key={c.key} numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.pace, style, { color: text }]}>
                {paceText(set, unit)}
              </ThemedText>
            );
          case 'done':
            return (
              <View key={c.key} style={style}>
                <Pressable
                  onPress={onToggleDone}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done }}
                  accessibilityLabel={done ? `${badge.accessibilityLabel} done` : `Complete ${badge.accessibilityLabel.toLowerCase()}`}
                  style={styles.doneWrap}
                >
                  <View style={[styles.check, done ? { backgroundColor: tint, borderColor: tint } : { borderColor: fieldBorder }]}>
                    {done ? <IconSymbol name="checkmark" size={16} color={onTint} /> : null}
                  </View>
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
                  tone={done ? 'done' : active ? 'active' : 'open'}
                  highlighted={active && !done && key === 'weight'}
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, paddingLeft: 18, paddingRight: 10 },
  badge: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  badgeText: { fontWeight: '700', fontVariant: ['tabular-nums'] },
  previous: { fontVariant: ['tabular-nums'] },
  pace: { fontSize: 17, textAlign: 'right', fontVariant: ['tabular-nums'] },
  doneWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  check: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
