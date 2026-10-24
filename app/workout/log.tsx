import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SheetHeader } from '@/components/ui/SheetHeader';
import { WorkoutEditorBody } from '@/components/workouts/WorkoutEditor';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useWorkoutEditor } from '@/hooks/useWorkoutEditor';
import { syncToSupabase } from '@/lib/sync';
import { cancelDraft, getOrCreateDraft, saveDraft } from '@/lib/workouts/drafts';

/** Log a past workout: edits a draft that Save turns into a finished workout. */
export default function LogPastWorkoutScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const requestedId = typeof params.id === 'string' && params.id ? params.id : undefined;
  const [draftId, setDraftId] = useState<string | undefined>(requestedId);
  const [initFailed, setInitFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const editor = useWorkoutEditor(draftId, 'manual');

  const background = useThemeColor({}, 'background');

  const openDraft = useCallback(() => {
    if (requestedId) return;
    getOrCreateDraft(new Date())
      .then((w) => {
        setInitFailed(false);
        setDraftId(w.id);
      })
      .catch(() => setInitFailed(true));
  }, [requestedId]);
  useEffect(openDraft, [openDraft]);

  const hasExercises = (editor.workout?.exercises.length ?? 0) > 0;

  const discard = async () => {
    if (!draftId) {
      router.back();
      return;
    }
    setBusy(true);
    try {
      await editor.flush();
      await cancelDraft(draftId);
    } catch {
      // The draft is purged after 7 days at the latest.
    }
    router.back();
  };

  const onCancel = () => {
    if (busy) return;
    if (!hasExercises) {
      void discard();
      return;
    }
    Alert.alert('Discard this workout?', 'What you entered is deleted.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => void discard() },
    ]);
  };

  const onSave = async () => {
    if (!draftId || busy) return;
    setBusy(true);
    try {
      await editor.flush();
      const result = await saveDraft(draftId, new Date());
      if (result === 'empty') {
        setBusy(false);
        Alert.alert('Nothing to save', 'Add a set with values, or tap Cancel.');
        return;
      }
      syncToSupabase();
      router.back();
    } catch {
      setBusy(false);
      Alert.alert('Couldn’t save the workout', 'Try again.');
    }
  };

  const onAddExercises = async () => {
    if (!draftId) return;
    await editor.flush();
    router.push({ pathname: '/workout/exercises', params: { pick: '1', workoutId: draftId } });
  };

  let body: React.ReactNode = null;
  if (initFailed || editor.status === 'error' || editor.status === 'missing') {
    body = (
      <EmptyState
        image={false}
        title="Couldn’t open this workout."
        style={styles.message}
        actions={
          <Button
            variant="secondary"
            label="Retry"
            onPress={() => {
              if (!requestedId && (initFailed || editor.status === 'missing')) {
                setInitFailed(false);
                setDraftId(undefined);
                openDraft();
              } else {
                void editor.reload();
              }
            }}
          />
        }
      />
    );
  } else if (editor.status === 'ready' && editor.workout) {
    body = <WorkoutEditorBody editor={editor} mode="manual" onAddExercises={onAddExercises} />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      <SheetHeader
        title="Log past workout"
        onCancel={onCancel}
        action={{ label: 'Save', onPress: () => void onSave(), disabled: editor.status !== 'ready' || busy }}
      />
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  message: { padding: 16 },
});
