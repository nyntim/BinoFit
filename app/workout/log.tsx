import { ControlSurface } from '@/components/navigation/ControlSurface';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
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
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const separator = useThemeColor({}, 'separator');
  const fieldBorder = useThemeColor({}, 'fieldBorder');

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
      <View style={styles.message}>
        <Text style={[styles.messageText, { color: muted }]}>Couldn’t open this workout.</Text>
        <Pressable
          onPress={() => {
            if (!requestedId && (initFailed || editor.status === 'missing')) {
              setInitFailed(false);
              setDraftId(undefined);
              openDraft();
            } else {
              void editor.reload();
            }
          }}
          accessibilityRole="button"
          style={[styles.retry, { borderColor: fieldBorder }]}
        >
          <Text style={[styles.retryText, { color: tint }]}>Retry</Text>
        </Pressable>
      </View>
    );
  } else if (editor.status === 'ready' && editor.workout) {
    body = <WorkoutEditorBody editor={editor} mode="manual" onAddExercises={onAddExercises} />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      <ControlSurface style={[styles.header, { borderBottomColor: separator }]}>
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={[styles.headerSide, styles.left]}
        >
          <Text style={[styles.headerButton, { color: tint }]}>Cancel</Text>
        </Pressable>
        <Text style={[styles.title, { color: text }]} accessibilityRole="header" numberOfLines={1}>
          Log past workout
        </Text>
        <Pressable
          onPress={onSave}
          disabled={editor.status !== 'ready' || busy}
          accessibilityRole="button"
          accessibilityLabel="Save"
          style={[styles.headerSide, styles.right, (editor.status !== 'ready' || busy) && { opacity: 0.5 }]}
        >
          <Text style={[styles.headerButton, styles.save, { color: tint }]}>Save</Text>
        </Pressable>
      </ControlSurface>
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerSide: { width: 80, minHeight: 44, justifyContent: 'center' },
  left: { alignItems: 'flex-start' },
  right: { alignItems: 'flex-end' },
  headerButton: { fontSize: 17 },
  save: { fontWeight: '600' },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  message: { padding: 16, gap: 16 },
  messageText: { fontSize: 15 },
  retry: {
    alignSelf: 'flex-start',
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  retryText: { fontSize: 17, fontWeight: '600' },
});
