import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { CelebrationBanner } from '@/components/ui/CelebrationBanner';
import { EmptyState } from '@/components/ui/EmptyState';
import { OptionsSheet } from '@/components/workouts/OptionsSheet';
import { NavIconButton, WorkoutNavBar } from '@/components/workouts/WorkoutNavBar';
import { WorkoutEditorBody } from '@/components/workouts/WorkoutEditor';
import { WorkoutSummaryView } from '@/components/workouts/WorkoutSummaryView';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useWorkoutEditor } from '@/hooks/useWorkoutEditor';
import { syncToSupabase } from '@/lib/sync';
import { deleteWorkout } from '@/lib/workouts/db';
import { cleanupEmptyEntries } from '@/lib/workouts/drafts';
import { clearJustFinished, wasJustFinished } from '@/lib/workouts/finish-celebration';
import { saveAsRoutineWithFeedback } from '@/lib/workouts/routine-flow';
import { countRecordExercises } from '@/lib/workouts/records';

/**
 * A finished workout: a read view with its records, and Edit to change it. Every edit writes
 * through to SQLite and syncs. Right after Finish a banner says the workout was saved.
 */
export default function WorkoutDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' && params.id ? params.id : undefined;
  const editor = useWorkoutEditor(id, 'edit');
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  // Read once on open: only a workout finished from the live session celebrates
  const [celebrate, setCelebrate] = useState(() => !!id && wasJustFinished(id));
  const hapticFired = useRef(false);

  const background = useThemeColor({}, 'background');

  // The banner shows once the workout and its prior records are loaded, so its copy is final
  const bannerReady = celebrate && editor.status === 'ready' && !!editor.workout;
  useEffect(() => {
    if (bannerReady && !hapticFired.current) {
      hapticFired.current = true;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [bannerReady]);

  // On leaving: finish pending writes, then drop sets and exercises left empty.
  const flushRef = useRef(editor.flush);
  useEffect(() => {
    flushRef.current = editor.flush;
  });
  useEffect(
    () => () => {
      if (!id) return;
      clearJustFinished(id);
      void flushRef
        .current()
        .then(() => cleanupEmptyEntries(id, new Date()))
        .then(() => syncToSupabase())
        .catch(() => undefined);
    },
    [id]
  );

  const onSaveAsRoutine = async () => {
    if (!id) return;
    await editor.flush();
    await saveAsRoutineWithFeedback(id);
  };

  const confirmDelete = () => {
    Alert.alert('Delete this workout?', 'This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          try {
            await editor.flush();
            await deleteWorkout(id);
            syncToSupabase();
            router.back();
          } catch {
            Alert.alert('Couldn’t delete the workout', 'Try again.');
          }
        },
      },
    ]);
  };

  const onAddExercises = async () => {
    if (!id) return;
    await editor.flush();
    router.push({ pathname: '/workout/exercises', params: { pick: '1', workoutId: id } });
  };

  let body: React.ReactNode = null;
  if (editor.status === 'missing' || !id) {
    body = <EmptyState image={false} title="This workout was deleted." style={styles.message} />;
  } else if (editor.status === 'error') {
    body = (
      <EmptyState
        image={false}
        title="Couldn’t load this workout."
        style={styles.message}
        actions={<Button variant="secondary" label="Retry" onPress={() => void editor.reload()} />}
      />
    );
  } else if (editor.status === 'ready' && editor.workout) {
    if (editing) {
      body = (
        <WorkoutEditorBody
          editor={editor}
          mode="edit"
          onAddExercises={onAddExercises}
          footer={
            <Button
              size="lg"
              label="Done"
              onPress={() => {
                void editor.flush().then(() => setEditing(false));
              }}
            />
          }
        />
      );
    } else {
      const records = countRecordExercises(editor.workout, editor.priorRecords);
      body = (
        <WorkoutSummaryView
          workout={editor.workout}
          priorRecords={editor.priorRecords}
          banner={
            celebrate ? (
              <CelebrationBanner
                title="Workout saved"
                body={records > 0 ? `${records} new ${records === 1 ? 'record' : 'records'}. Nice work.` : undefined}
                onDismiss={() => setCelebrate(false)}
              />
            ) : null
          }
          onSaveAsRoutine={() => void onSaveAsRoutine()}
          onEdit={() => {
            setEditing(true);
            setCelebrate(false);
          }}
        />
      );
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      <WorkoutNavBar
        label="Back"
        onBack={() => {
          void editor.flush().then(() => router.back());
        }}
        trailing={
          <NavIconButton icon="ellipsis" label="More options" disabled={editor.status !== 'ready'} onPress={() => setMenuOpen(true)} />
        }
      />
      {body}
      <OptionsSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        options={[
          { key: 'routine', label: 'Save as routine', onPress: () => void onSaveAsRoutine() },
          { key: 'delete', label: 'Delete workout', onPress: confirmDelete },
        ]}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  message: { padding: 16 },
});
