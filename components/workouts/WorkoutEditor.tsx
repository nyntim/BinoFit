import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { AddExercisesButton } from '@/components/workouts/AddExercisesButton';
import { ExerciseBlock } from '@/components/workouts/ExerciseBlock';
import { OptionsSheet } from '@/components/workouts/OptionsSheet';
import { RestPickerSheet } from '@/components/workouts/RestPickerSheet';
import { SetRow } from '@/components/workouts/SetRow';
import { SetTableHeader } from '@/components/workouts/SetTableHeader';
import { SetTypeSheet } from '@/components/workouts/SetTypeSheet';
import { WorkoutMetaCard } from '@/components/workouts/WorkoutMetaCard';
import { useThemeColor } from '@/hooks/use-theme-color';
import { usePreferences } from '@/hooks/usePreferences';
import type { ToggleResult, WorkoutEditor as Editor, EditorMode } from '@/hooks/useWorkoutEditor';
import { formatDuration } from '@/lib/units';
import { exerciseDisplayName } from '@/lib/workouts/exercise-catalog';
import {
  applySchedule,
  cellPatch,
  setBadges,
  setColumns,
  type CellKey,
} from '@/lib/workouts/editor-state';
import { formatShortDate, setupDetailLine } from '@/lib/workouts/format';
import { formatPreviousSet, previousFor } from '@/lib/workouts/prefill';
import {
  bestNewRecords,
  EMPTY_RECORDS,
  formatRecordSummary,
  newRecordsFor,
  recordSetFromWorkoutSet,
} from '@/lib/workouts/records';

type Props = {
  editor: Editor;
  mode: EditorMode;
  /** Opens the exercise picker (flush the editor first). */
  onAddExercises: () => void;
  /** Rendered after "+ Add exercises" (e.g. the session's Discard). */
  footer?: ReactNode;
  /** Hide the name / date card (the live session shows its own header). Default true. */
  showMeta?: boolean;
  /** Content above the cards (e.g. the rest banner). */
  header?: ReactNode;
  /** Called after a set is ticked or unticked in the live session (starts or cancels the rest). */
  onToggled?: (result: ToggleResult) => void;
};

/**
 * The shared body of the workout editor: meta card, one block per exercise with its set table,
 * and "+ Add exercises". Used by Log past workout, the finished-workout screen and the live session.
 */
export function WorkoutEditorBody({ editor, mode, onAddExercises, footer, showMeta = true, header, onToggled }: Props) {
  const { weightUnit: unit, showRpe } = usePreferences();
  const tint = useThemeColor({}, 'tint');
  const muted = useThemeColor({}, 'icon');
  const [exerciseMenu, setExerciseMenu] = useState<string | null>(null);
  const [restMenu, setRestMenu] = useState<string | null>(null);
  const [setMenu, setSetMenu] = useState<string | null>(null);

  const { workout, writeError, clearWriteError } = editor;
  useEffect(() => {
    if (!writeError) return;
    Alert.alert('Couldn’t save that change', 'Try again.', [{ text: 'OK', onPress: clearWriteError }], {
      onDismiss: clearWriteError,
    });
  }, [writeError, clearWriteError]);
  if (!workout) return null;
  const live = mode === 'live';

  const menuSet = setMenu ? workout.exercises.flatMap((e) => e.sets).find((s) => s.id === setMenu) : undefined;
  const menuExercise = exerciseMenu ? workout.exercises.find((e) => e.id === exerciseMenu) : undefined;
  const restExercise = restMenu ? workout.exercises.find((e) => e.id === restMenu) : undefined;

  const confirmRemove = (id: string, name: string) => {
    Alert.alert(`Remove ${name}?`, 'Its sets are removed from this workout.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => editor.removeExercise(id) },
    ]);
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
    >
      {header}
      {showMeta ? (
        <WorkoutMetaCard
          workout={workout}
          showSchedule={!live}
          namePlaceholder={`Workout · ${formatShortDate(workout.date)}`}
          onChangeName={(name) => editor.updateMeta({ name })}
          onChangeSchedule={(change) => editor.updateMeta(applySchedule(workout, change))}
        />
      ) : null}

      {workout.exercises.map((ex) => {
        const logType = ex.exercise?.log_type ?? 'weight_reps';
        const perSide = !!ex.exercise?.per_side;
        const columns = setColumns(logType, perSide, unit, { showRpe, showDone: live });
        const badges = setBadges(ex.sets);
        const prevSets = editor.previous.get(ex.exercise_id);
        const title = ex.exercise ? exerciseDisplayName(ex.exercise) : ex.exercise_name;
        const restLabel =
          live && ex.rest_seconds !== null ? (ex.rest_seconds === 0 ? 'Rest off' : `Rest ${formatDuration(ex.rest_seconds)}`) : null;
        const rawLogType = ex.exercise?.log_type ?? null;
        const priorForEx =
          rawLogType === 'weight_reps' && editor.priorRecords !== null
            ? (editor.priorRecords.get(ex.exercise_id) ?? EMPTY_RECORDS)
            : null;
        const workoutAt = workout.started_at ?? workout.created_at;
        const recordSets =
          priorForEx !== null
            ? ex.sets.map((s) =>
                recordSetFromWorkoutSet({
                  set: s,
                  exerciseId: ex.exercise_id,
                  at: workoutAt,
                  logType: rawLogType,
                  perSide,
                })
              )
            : null;
        const recordSummary =
          mode === 'edit' && recordSets !== null && priorForEx !== null
            ? formatRecordSummary(bestNewRecords(recordSets, priorForEx), unit, perSide)
            : null;
        return (
          <ExerciseBlock
            key={ex.id}
            title={title}
            setupNotes={ex.exercise ? setupDetailLine(ex.exercise, unit) : null}
            restLabel={restLabel}
            onOptions={() => setExerciseMenu(ex.id)}
          >
            {recordSummary ? (
              <Text
                accessibilityLabel={recordSummary.replace(/^PR\b/, 'Personal record')}
                style={[styles.recordLine, { color: muted }]}
              >
                {recordSummary}
              </Text>
            ) : null}
            <SetTableHeader columns={columns} />
            {ex.sets.map((s, i) => {
              const prev = previousFor(i, prevSets);
              const isPr =
                recordSets !== null && priorForEx !== null
                  ? newRecordsFor(recordSets[i], priorForEx).length > 0
                  : false;
              return (
                <SetRow
                  key={s.id}
                  columns={columns}
                  set={s}
                  badge={badges[i]}
                  unit={unit}
                  previousSet={prev}
                  previousText={formatPreviousSet(prev, logType, perSide, unit)}
                  personalRecord={isPr}
                  onChangeCell={(key: CellKey, text: string) => {
                    const patch = cellPatch(key, text, unit);
                    if (patch) editor.updateSet(s.id, patch);
                  }}
                  onPressBadge={() => setSetMenu(s.id)}
                  onToggleDone={
                    live
                      ? () => {
                          const result = editor.toggleDone(s.id);
                          if (result) onToggled?.(result);
                        }
                      : undefined
                  }
                />
              );
            })}
            <Pressable
              onPress={() => editor.addSet(ex.id)}
              accessibilityRole="button"
              accessibilityLabel={`Add set to ${title}`}
              style={styles.addSet}
            >
              <Text style={[styles.addSetText, { color: tint }]}>+ Add set</Text>
            </Pressable>
          </ExerciseBlock>
        );
      })}

      <AddExercisesButton onPress={onAddExercises} />
      {footer}

      <SetTypeSheet
        visible={!!menuSet}
        current={menuSet?.set_type ?? 'normal'}
        onSelect={(t) => menuSet && editor.setSetType(menuSet.id, t)}
        onDelete={() => menuSet && editor.deleteSet(menuSet.id)}
        onClose={() => setSetMenu(null)}
      />
      <OptionsSheet
        visible={!!menuExercise}
        title={menuExercise ? (menuExercise.exercise ? exerciseDisplayName(menuExercise.exercise) : menuExercise.exercise_name) : undefined}
        onClose={() => setExerciseMenu(null)}
        options={[
          ...(live && menuExercise
            ? [{ key: 'rest', label: 'Rest time', onPress: () => setRestMenu(menuExercise.id) }]
            : []),
          ...(menuExercise
            ? [
                {
                  key: 'remove',
                  label: 'Remove exercise',
                  onPress: () =>
                    confirmRemove(
                      menuExercise.id,
                      menuExercise.exercise ? exerciseDisplayName(menuExercise.exercise) : menuExercise.exercise_name
                    ),
                },
              ]
            : []),
        ]}
      />
      <RestPickerSheet
        visible={!!restExercise}
        current={restExercise?.rest_seconds}
        onClose={() => setRestMenu(null)}
        onSelect={(sec) => restExercise && editor.updateExercise(restExercise.id, { rest_seconds: sec })}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  recordLine: { fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'] },
  addSet: { minHeight: 44, justifyContent: 'center' },
  addSetText: { fontSize: 15, fontWeight: '600' },
});
