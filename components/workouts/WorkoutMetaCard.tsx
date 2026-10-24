import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { format } from 'date-fns';
import { TimePickerSheet } from '@/components/time-picker-sheet';
import { Card } from '@/components/ui/Card';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useThemeColors } from '@/hooks/useThemeColors';
import type { Workout } from '@/lib/types';
import type { ScheduleChange } from '@/lib/workouts/editor-state';
import { registerPendingEdit } from '@/lib/workouts/pending-edits';
import { formatHoursMinutes, formatShortDate, parseClockDigits } from '@/lib/workouts/format';

type Props = {
  workout: Pick<Workout, 'name' | 'date' | 'started_at' | 'duration_seconds'>;
  /** Shows Date, Start and Duration (logging afterward and editing; not in a live session). */
  showSchedule: boolean;
  /** The placeholder of the name field, e.g. "Workout · Wed 15 Oct". */
  namePlaceholder: string;
  onChangeName: (name: string | null) => void;
  onChangeSchedule: (change: ScheduleChange) => void;
};

/** Name and, optionally, date / start / duration of a workout. */
export function WorkoutMetaCard({ workout, showSchedule, namePlaceholder, onChangeName, onChangeSchedule }: Props) {
  const colors = useThemeColors();
  const separator = useThemeColor({}, 'separator');
  const tint = useThemeColor({}, 'tint');
  const tintSoft = useThemeColor({}, 'tintSoft');
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const [nameText, setNameText] = useState<string | null>(null);
  const [durationText, setDurationText] = useState<string | null>(null);

  // Typed text is committed on blur and, through the pending-edit registry, when the editor flushes.
  const commitName = () => {
    if (nameText === null) return;
    const t = nameText.trim();
    setNameText(null);
    if (t !== (workout.name ?? '')) onChangeName(t || null);
  };
  const commitDuration = () => {
    if (durationText === null) return;
    const seconds = parseClockDigits(durationText, 'hm');
    setDurationText(null);
    if (seconds !== null && seconds > 0 && seconds !== workout.duration_seconds) {
      onChangeSchedule({ duration_seconds: seconds });
    }
  };
  const commitRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    commitRef.current = () => {
      commitName();
      commitDuration();
    };
  });
  useEffect(() => registerPendingEdit(() => commitRef.current()), []);

  const start = workout.started_at ? new Date(workout.started_at) : null;
  const startValid = start && !Number.isNaN(start.getTime()) ? start : null;
  const dateValue = (() => {
    const [y, m, d] = workout.date.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  })();
  const durationDisplay = workout.duration_seconds ? formatHoursMinutes(workout.duration_seconds) : '';

  const pill = [styles.pill, { backgroundColor: tintSoft }];
  const rowStyle = [styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: separator }];

  return (
    <Card padding="none">
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.icon }]} accessible={false}>Name</Text>
        <TextInput
          value={nameText ?? workout.name ?? ''}
          placeholder={namePlaceholder}
          placeholderTextColor={colors.icon}
          selectionColor={tint}
          accessibilityLabel="Workout name"
          returnKeyType="done"
          maxFontSizeMultiplier={1.3}
          onChangeText={setNameText}
          onBlur={commitName}
          style={[styles.nameInput, { color: colors.text }]}
        />
      </View>

      {showSchedule ? (
        <>
          <View style={rowStyle}>
            <Text style={[styles.label, { color: colors.icon }]} accessible={false}>Date</Text>
            <View style={styles.end}>
              <Pressable
                onPress={() => setPicker('date')}
                accessibilityRole="button"
                accessibilityLabel={`Date, ${formatShortDate(workout.date)}`}
                hitSlop={{ top: 4, bottom: 4 }}
                style={pill}
              >
                <Text style={[styles.pillText, { color: tint }]} numberOfLines={1}>{formatShortDate(workout.date)}</Text>
              </Pressable>
            </View>
          </View>
          <View style={rowStyle}>
            <Text style={[styles.label, { color: colors.icon }]} accessible={false}>Start</Text>
            <View style={styles.end}>
              <Pressable
                onPress={() => setPicker('time')}
                accessibilityRole="button"
                accessibilityLabel={`Start time, ${startValid ? format(startValid, 'h:mm a') : 'not set'}`}
                hitSlop={{ top: 4, bottom: 4 }}
                style={pill}
              >
                <Text style={[styles.pillText, { color: tint }]} numberOfLines={1}>{startValid ? format(startValid, 'h:mm a') : '--'}</Text>
              </Pressable>
            </View>
          </View>
          <View style={rowStyle}>
            <Text style={[styles.label, { color: colors.icon }]} accessible={false}>Duration</Text>
            <View style={styles.end}>
              <TextInput
                value={durationText ?? durationDisplay}
                placeholder="0:00"
                placeholderTextColor={colors.icon}
                selectionColor={tint}
                maxFontSizeMultiplier={1.3}
                keyboardType="number-pad"
                accessibilityLabel="Duration in hours and minutes"
                selectTextOnFocus
                onChangeText={setDurationText}
                onBlur={commitDuration}
                style={[...pill, styles.durationInput, { color: tint }]}
              />
            </View>
          </View>
        </>
      ) : null}

      {showSchedule ? (
        <TimePickerSheet
          visible={picker !== null}
          mode={picker === 'date' ? 'date' : 'time'}
          title={picker === 'date' ? 'Date' : 'Start time'}
          value={picker === 'date' ? dateValue : (startValid ?? new Date())}
          maximumDate={picker === 'date' ? new Date() : undefined}
          colors={colors}
          onClose={() => setPicker(null)}
          onChange={(d) => onChangeSchedule(picker === 'date' ? { date: d } : { time: d })}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 4 },
  label: { width: 84, fontSize: 15 },
  nameInput: { flex: 1, minWidth: 0, minHeight: 44, fontSize: 15, fontWeight: '600' },
  end: { flex: 1, alignItems: 'flex-end' },
  pill: { minHeight: 36, minWidth: 64, paddingHorizontal: 14, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  pillText: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  durationInput: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'], textAlign: 'center', paddingVertical: 0 },
});
