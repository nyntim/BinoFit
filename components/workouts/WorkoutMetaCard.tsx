import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { format } from 'date-fns';
import { TimePickerSheet } from '@/components/time-picker-sheet';
import { BuilderInput } from '@/components/workouts/BuilderInput';
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
  const card = useThemeColor({}, 'cardBackground');
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

  const fieldStyle = [styles.input, styles.pressField, { backgroundColor: colors.cardSecondary, color: colors.text }];

  return (
    <View style={[styles.card, { backgroundColor: card }]}>
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.icon }]}>Name</Text>
        <BuilderInput
          value={nameText ?? workout.name ?? ''}
          placeholder={namePlaceholder}
          accessibilityLabel="Workout name"
          returnKeyType="done"
          maxFontSizeMultiplier={1.3}
          onChangeText={setNameText}
          onBlur={commitName}
          style={styles.input}
        />
      </View>

      {showSchedule ? (
        <View style={styles.schedule}>
          <View style={[styles.field, styles.third]}>
            <Text style={[styles.label, { color: colors.icon }]}>Date</Text>
            <Pressable
              onPress={() => setPicker('date')}
              accessibilityRole="button"
              accessibilityLabel={`Date, ${formatShortDate(workout.date)}`}
              style={[fieldStyle, styles.press]}
            >
              <Text style={[styles.value, { color: colors.text }]} numberOfLines={1}>
                {formatShortDate(workout.date)}
              </Text>
            </Pressable>
          </View>
          <View style={[styles.field, styles.third]}>
            <Text style={[styles.label, { color: colors.icon }]}>Start</Text>
            <Pressable
              onPress={() => setPicker('time')}
              accessibilityRole="button"
              accessibilityLabel={`Start time, ${startValid ? format(startValid, 'h:mm a') : 'not set'}`}
              style={[fieldStyle, styles.press]}
            >
              <Text style={[styles.value, { color: colors.text }]} numberOfLines={1}>
                {startValid ? format(startValid, 'h:mm a') : '--'}
              </Text>
            </Pressable>
          </View>
          <View style={[styles.field, styles.third]}>
            <Text style={[styles.label, { color: colors.icon }]}>Duration</Text>
            <BuilderInput
              value={durationText ?? durationDisplay}
              placeholder="0:00"
              maxFontSizeMultiplier={1.3}
              keyboardType="number-pad"
              accessibilityLabel="Duration in hours and minutes"
              selectTextOnFocus
              onChangeText={setDurationText}
              onBlur={commitDuration}
              style={styles.input}
            />
          </View>
        </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: 16, gap: 12 },
  field: { gap: 4 },
  label: { fontSize: 13, fontWeight: '500' },
  schedule: { flexDirection: 'row', gap: 8 },
  third: { flex: 1, minWidth: 0 },
  input: {
    height: 44,
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  press: { justifyContent: 'center' },
  pressField: { borderWidth: 1.5, borderColor: 'transparent' },
  value: { fontSize: 15, fontVariant: ['tabular-nums'] },
});
