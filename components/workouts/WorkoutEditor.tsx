import { useEffect, useState, type ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { AddExercisesButton } from '@/components/workouts/AddExercisesButton';
import { ExerciseBlock } from '@/components/workouts/ExerciseBlock';
import { ExerciseSummaryCard } from '@/components/workouts/ExerciseSummaryCard';
import { OptionsSheet } from '@/components/workouts/OptionsSheet';
import { RestPickerSheet } from '@/components/workouts/RestPickerSheet';
import { SetRow } from '@/components/workouts/SetRow';
import { SetTableHeader } from '@/components/workouts/SetTableHeader';
import { SetTypeSheet } from '@/components/workouts/SetTypeSheet';
import { PlaylistRow } from '@/components/workouts/PlaylistRow';
import { WorkoutMetaCard } from '@/components/workouts/WorkoutMetaCard';
import { useThemeColor } from '@/hooks/use-theme-color';
import { usePreferences } from '@/hooks/usePreferences';
import type { ToggleResult, WorkoutEditor as Editor, EditorMode } from '@/hooks/useWorkoutEditor';
import { restChoiceLabel } from '@/lib/workouts/rest-timer';
import { exerciseDisplayName } from '@/lib/workouts/exercise-catalog';
import {
  applySchedule,
  badgeIfNormal,
  cellPatch,
  liveFocus,
  setBadges,
  setColumns,
  type CellKey,
} from '@/lib/workouts/editor-state';
import { formatShortDate, setupDetailLine } from '@/lib/workouts/format';
import { DEFAULT_REST_SECONDS, formatPreviousSet, previousFor } from '@/lib/workouts/prefill';
import { formatRecordSummary, workoutRecords } from '@/lib/workouts/records';

type Props = {
  editor: Editor;
  mode: EditorMode;
  /** Opens the exercise picker (flush the editor first). */
  onAddExercises: () => void;
  /** Rendered with "Add exercises" (e.g. the session's Discard, beside it in live mode). */
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
  const { weightUnit: unit, showEffort, effortMetric, restTimerEnabled } = usePreferences();
  const muted = useThemeColor({}, 'icon');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
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

  const menuSetExercise = setMenu ? workout.exercises.find((e) => e.sets.some((s) => s.id === setMenu)) : undefined;
  const menuSet = menuSetExercise?.sets.find((s) => s.id === setMenu);
  const menuSetIndex = menuSetExercise && menuSet ? menuSetExercise.sets.indexOf(menuSet) : -1;
  const menuSetBadge = menuSetExercise && menuSetIndex >= 0 ? setBadges(menuSetExercise.sets)[menuSetIndex] : undefined;
  const menuSetName = menuSetExercise ? (menuSetExercise.exercise ? exerciseDisplayName(menuSetExercise.exercise) : menuSetExercise.exercise_name) : '';
  const menuSetValue = menuSetExercise && menuSet
    ? formatPreviousSet(menuSet, menuSetExercise.exercise?.log_type ?? 'weight_reps', !!menuSetExercise.exercise?.per_side, unit)
    : null;
  const menuExercise = exerciseMenu ? workout.exercises.find((e) => e.id === exerciseMenu) : undefined;
  const restExercise = restMenu ? workout.exercises.find((e) => e.id === restMenu) : undefined;

  const confirmRemove = (id: string, name: string) => {
    Alert.alert(`Remove ${name}?`, 'Its sets are removed from this workout.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => editor.removeExercise(id) },
    ]);
  };

  const records = workoutRecords(workout, editor.priorRecords);
  const focus = live ? liveFocus(workout) : null;
  const addExercises = <AddExercisesButton onPress={onAddExercises} variant={live ? 'plain' : 'dashed'} />;

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
      {mode === 'edit' && workout.playlist_id ? (
        <PlaylistRow playlistId={workout.playlist_id} playlistName={workout.playlist_name} />
      ) : null}

      {workout.exercises.map((ex) => {
        const logType = ex.exercise?.log_type ?? 'weight_reps';
        const perSide = !!ex.exercise?.per_side;
        const columns = setColumns(logType, perSide, unit, { effort: showEffort ? effortMetric : null, showDone: live });
        const badges = setBadges(ex.sets);
        const prevSets = editor.previous.get(ex.exercise_id);
        const title = ex.exercise ? exerciseDisplayName(ex.exercise) : ex.exercise_name;
        const restLabel =
          live && restTimerEnabled && ex.rest_seconds !== null
            ? ex.rest_seconds === 0
              ? restChoiceLabel(0)
              : `Rest ${restChoiceLabel(ex.rest_seconds)}`
            : null;
        const result = records.get(ex.id);
        const recordSummary = mode === 'edit' && result ? formatRecordSummary(result.beaten, unit, perSide) : null;
        const tag = logType === 'distance_duration' ? 'Cardio' : logType === 'duration' ? 'Time' : null;

        if (focus?.upcomingIds.has(ex.id) && !expanded.has(ex.id)) {
          return (
            <ExerciseSummaryCard
              key={ex.id}
              name={title}
              done={ex.sets.filter((s) => s.completed_at).length}
              total={ex.sets.length}
              last={formatPreviousSet(previousFor(0, prevSets), logType, perSide, unit)}
              onPress={() => setExpanded((prev) => new Set(prev).add(ex.id))}
            />
          );
        }
        return (
          <ExerciseBlock
            key={ex.id}
            title={title}
            setupNotes={ex.exercise ? setupDetailLine(ex.exercise, unit) : null}
            restLabel={restLabel}
            tag={tag}
            onOptions={() => setExerciseMenu(ex.id)}
          >
            {recordSummary ? (
              <View style={styles.recordWrap}>
                <Text
                  accessibilityLabel={recordSummary.replace(/^PR\b/, 'Personal record')}
                  style={[styles.recordLine, { color: muted }]}
                >
                  {recordSummary}
                </Text>
              </View>
            ) : null}
            <SetTableHeader columns={columns} />
            {ex.sets.map((s, i) => {
              const prev = previousFor(i, prevSets);
              const isPr = !!result?.setKinds.has(s.id);
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
                  active={focus?.activeSetId === s.id}
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
            <Button
              variant="ghost"
              label="+ Add set"
              accessibilityLabel={`Add set to ${title}`}
              fullWidth
              onPress={() => editor.addSet(ex.id)}
            />
          </ExerciseBlock>
        );
      })}

      {live ? (
        <View style={styles.footerRow}>
          {addExercises}
          {footer}
        </View>
      ) : (
        <>
          {addExercises}
          {footer}
        </>
      )}

      <SetTypeSheet
        visible={!!menuSet}
        current={menuSet?.set_type ?? 'normal'}
        title={menuSetBadge?.accessibilityLabel ?? 'Set'}
        subtitle={menuSetValue ? `${menuSetName} · ${menuSetValue}` : menuSetName}
        normalBadge={menuSetExercise && menuSetIndex >= 0 ? badgeIfNormal(menuSetExercise.sets, menuSetIndex) : '1'}
        restLabel={
          menuSetExercise ? restChoiceLabel(menuSetExercise.rest_seconds ?? DEFAULT_REST_SECONDS) : null
        }
        onRest={
          live && restTimerEnabled && menuSetExercise
            ? () => setRestMenu(menuSetExercise.id)
            : undefined
        }
        onSelect={(t) => menuSet && editor.setSetType(menuSet.id, t)}
        onDelete={() => menuSet && editor.deleteSet(menuSet.id)}
        onClose={() => setSetMenu(null)}
      />
      <OptionsSheet
        visible={!!menuExercise}
        title={menuExercise ? (menuExercise.exercise ? exerciseDisplayName(menuExercise.exercise) : menuExercise.exercise_name) : undefined}
        onClose={() => setExerciseMenu(null)}
        options={[
          ...(live && restTimerEnabled && menuExercise
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
  recordWrap: { paddingHorizontal: 18, paddingBottom: 6 },
  recordLine: { fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'] },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
