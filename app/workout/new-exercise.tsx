import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { BuilderInput } from '@/components/workouts/BuilderInput';
import { ChipToggle } from '@/components/workouts/ChipToggle';
import { OptionCard } from '@/components/workouts/OptionCard';
import { ReviewRow } from '@/components/workouts/ReviewRow';
import { StepProgress } from '@/components/workouts/StepProgress';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useExercises } from '@/hooks/useExercises';
import { usePreferences } from '@/hooks/usePreferences';
import { syncToSupabase } from '@/lib/sync';
import { parseDecimal } from '@/lib/units';
import { getWorkout } from '@/lib/workouts/db';
import { addExerciseToWorkout } from '@/lib/workouts/previous';
import {
  EQUIPMENT_LABELS,
  EQUIPMENT_OPTIONS,
  LOG_TYPE_OPTIONS,
  MUSCLE_GROUPS,
  MUSCLE_LABELS,
  isRepLogType,
} from '@/lib/workouts/exercise-catalog';
import {
  applyEquipment,
  applyLogType,
  applySuggestion,
  builderSteps,
  draftDisplayName,
  draftSummary,
  draftToExerciseInput,
  emptyDraft,
  exerciseToDraft,
  isPlateLoaded,
  isStepValid,
  nameSuggestions,
  primaryLabel,
  reviewRows,
  setDraftName,
  toggleMuscle,
  type BuilderDraft,
  type BuilderStepId,
} from '@/lib/workouts/exercise-builder';
import {
  createCustomExercise,
  deleteCustomExercise,
  getExerciseById,
  updateCustomExercise,
} from '@/lib/workouts/exercises';
import { SEED_EXERCISES } from '@/lib/workouts/exercise-seed';
import { workoutDisplayName } from '@/lib/workouts/format';
import { routineDisplayName } from '@/lib/workouts/routine-plan';
import { addExerciseToRoutine, getRoutine } from '@/lib/workouts/routines';
import type { Exercise } from '@/lib/types';

type Saved = { name: string; summary: string; notes: string; addedTo: string | null };

export default function NewExerciseScreen() {
  const params = useLocalSearchParams<{ id?: string; name?: string; workoutId?: string; routineId?: string }>();
  const editId = typeof params.id === 'string' && params.id ? params.id : undefined;
  const workoutId = typeof params.workoutId === 'string' && params.workoutId ? params.workoutId : undefined;
  const routineId = typeof params.routineId === 'string' && params.routineId ? params.routineId : undefined;
  const prefillName = typeof params.name === 'string' ? params.name : '';

  const { weightUnit } = usePreferences();
  const { brands } = useExercises();
  const navigation = useNavigation();

  const initial = useMemo(() => emptyDraft(prefillName), [prefillName]);
  const [draft, setDraft] = useState<BuilderDraft>(initial);
  const [baseline, setBaseline] = useState<BuilderDraft>(initial);
  const [stepId, setStepId] = useState<BuilderStepId>('equipment');
  const [loadState, setLoadState] = useState<'ready' | 'loading' | 'missing'>(editId ? 'loading' : 'ready');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const bypass = useRef(false);
  const savedExerciseId = useRef<string | null>(null);

  const editing = !!editId;

  // Edit mode: load the exercise and open at the review card.
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    getExerciseById(editId)
      .then((e: Exercise | null) => {
        if (cancelled) return;
        if (!e || e.deleted_at || e.source !== 'custom') {
          setLoadState('missing');
          return;
        }
        const d = exerciseToDraft(e, weightUnit);
        setDraft(d);
        setBaseline(d);
        setStepId('review');
        setLoadState('ready');
      })
      .catch(() => {
        if (!cancelled) setLoadState('missing');
      });
    return () => {
      cancelled = true;
    };
    // The unit is read once, when the draft is created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const card = useThemeColor({}, 'cardBackground');
  const separator = useThemeColor({}, 'separator');
  const fieldBorder = useThemeColor({}, 'fieldBorder');
  const tint = useThemeColor({}, 'tint');

  const steps = builderSteps(draft);
  const found = steps.indexOf(stepId);
  const index = found >= 0 ? found : 0;
  const step = steps[index];
  const changed = useMemo(() => JSON.stringify(draft) !== JSON.stringify(baseline), [draft, baseline]);
  const valid = isStepValid(draft, step);

  usePreventRemove(changed && !saved, ({ data }) => {
    if (bypass.current) {
      navigation.dispatch(data.action);
      return;
    }
    Alert.alert('Discard this exercise?', 'Your changes won’t be saved.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          bypass.current = true;
          navigation.dispatch(data.action);
        },
      },
    ]);
  });

  // Android back goes back one step, like the footer Back; on the first step it falls through to close (and the discard prompt).
  const previousStep = !saved && index > 0 ? steps[index - 1] : null;
  useEffect(() => {
    if (!previousStep) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setStepId(previousStep);
      return true;
    });
    return () => sub.remove();
  }, [previousStep]);

  const patch = (p: Partial<BuilderDraft>) => setDraft((d) => ({ ...d, ...p }));
  const goTo = (target: BuilderStepId) => setStepId(target);

  const save = async () => {
    if (saving || !isStepValid(draft, 'review')) return;
    setSaving(true);
    try {
      const input = draftToExerciseInput(draft, weightUnit);
      const existingId = editId ?? savedExerciseId.current;
      let exercise: Exercise | null;
      if (existingId) {
        exercise = await updateCustomExercise(existingId, input);
        if (!exercise) throw new Error('Exercise not found');
      } else {
        exercise = await createCustomExercise(input);
        savedExerciseId.current = exercise.id;
      }
      let addedTo: string | null = null;
      let addFailed = false;
      if (routineId && !editing) {
        try {
          const routine = await getRoutine(routineId);
          if (!routine) throw new Error('Routine not found');
          await addExerciseToRoutine(routineId, exercise.id);
          addedTo = routineDisplayName(routine);
        } catch {
          addFailed = true;
        }
      } else if (workoutId && !editing) {
        try {
          const workout = await getWorkout(workoutId);
          if (!workout) throw new Error('Workout not found');
          await addExerciseToWorkout(workoutId, exercise.id);
          addedTo = workoutDisplayName(workout);
        } catch {
          addFailed = true;
        }
      }
      syncToSupabase();
      if (addFailed) {
        Alert.alert(
          'Saved, but not added',
          routineId
            ? 'The exercise is in your exercises, but it couldn’t be added to the routine.'
            : 'The exercise is in your exercises, but it couldn’t be added to the workout.'
        );
      }
      bypass.current = true;
      setSaved({
        name: draftDisplayName(draft),
        summary: draftSummary(draft),
        notes: draft.notes.trim(),
        addedTo,
      });
    } catch {
      Alert.alert('Couldn’t save the exercise', 'Your answers are still here. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!editId) return;
    Alert.alert('Delete this exercise?', 'Past workouts keep its name.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCustomExercise(editId);
            syncToSupabase();
            bypass.current = true;
            router.back();
          } catch {
            Alert.alert('Couldn’t delete the exercise', 'Try again.');
          }
        },
      },
    ]);
  };

  const onNext = () => {
    if (!valid) return;
    if (step === 'review') {
      save();
      return;
    }
    setStepId(steps[index + 1]);
  };

  const onDone = () => {
    if ((workoutId || routineId) && !editing) router.dismiss(2);
    else router.back();
  };

  // ── Saved card ─────────────────────────────────────────────────
  if (saved) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
        <View style={styles.savedBody}>
          <Text style={[styles.label, { color: muted }]}>SAVED TO YOUR EXERCISES</Text>
          <View style={[styles.savedCard, { backgroundColor: card }]}>
            <Text style={[styles.question, { color: text }]}>{saved.name}</Text>
            <Text style={[styles.meta, { color: muted }]}>{saved.summary}</Text>
            {saved.notes ? <Text style={[styles.meta, { color: muted }]}>{saved.notes}</Text> : null}
          </View>
          {saved.addedTo ? <Text style={[styles.hint, { color: muted }]}>{`Added to ${saved.addedTo}.`}</Text> : null}
        </View>
        <View style={styles.footer}>
          <Pressable
            onPress={onDone}
            accessibilityRole="button"
            style={[styles.primary, styles.primaryGrow, { backgroundColor: tint }]}
          >
            <Text style={[styles.primaryText, { color: background }]}>Done</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (loadState !== 'ready') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={styles.headerSide}
          >
            <Text style={[styles.headerButton, { color: tint }]}>Cancel</Text>
          </Pressable>
        </View>
        {loadState === 'missing' ? (
          <Text style={[styles.hint, styles.padded, { color: muted }]}>Couldn’t find this exercise.</Text>
        ) : null}
      </SafeAreaView>
    );
  }

  // ── Step bodies ────────────────────────────────────────────────
  const suggestions = nameSuggestions(draft.name, SEED_EXERCISES);
  const showSuggestions = suggestions.length > 0 && !draft.copiedFrom;
  const isPlate = isPlateLoaded(draft);

  const questionFor = (id: BuilderStepId) =>
    ({
      equipment: 'What equipment does it use?',
      brand: 'Which brand is it?',
      loading: 'How is it loaded?',
      name: 'What’s the exercise called?',
      muscles: 'Which muscles does it work?',
      logtype: 'How do you log it?',
      notes: 'Any setup notes?',
      review: '',
    })[id];

  let body: React.ReactNode = null;
  switch (step) {
    case 'equipment':
      body = (
        <View style={styles.stack} accessibilityRole="radiogroup">
          {EQUIPMENT_OPTIONS.map((eq) => (
            <OptionCard
              key={eq}
              label={EQUIPMENT_LABELS[eq]}
              selected={draft.equipment === eq}
              onPress={() => setDraft((d) => applyEquipment(d, eq))}
            />
          ))}
        </View>
      );
      break;
    case 'brand':
      body = (
        <>
          <Text style={[styles.hint, { color: muted }]}>
            Optional. It goes in the name so you can tell machines apart.
          </Text>
          <BuilderInput
            value={draft.brand}
            onChangeText={(brand) => patch({ brand })}
            accessibilityLabel="Brand"
            placeholder="e.g. Hammer Strength"
            autoCapitalize="words"
            returnKeyType="done"
          />
          {brands.length > 0 && (
            <>
              <Text style={[styles.label, { color: muted }]}>BRANDS YOU’VE USED</Text>
              <View style={styles.chips}>
                {brands.map((b) => (
                  <ChipToggle
                    key={b}
                    label={b}
                    selected={draft.brand.trim().toLowerCase() === b.toLowerCase()}
                    onPress={() => patch({ brand: b })}
                  />
                ))}
              </View>
            </>
          )}
        </>
      );
      break;
    case 'loading':
      body = (
        <>
          <View style={styles.stack} accessibilityRole="radiogroup">
            <OptionCard
              label="Weight stack"
              description="Pin-select stack"
              selected={draft.loadType === 'stack'}
              onPress={() => patch({ loadType: 'stack' })}
            />
            <OptionCard
              label="Plate-loaded"
              description="You add plates; you log the plates added"
              selected={draft.loadType === 'plate'}
              onPress={() => patch({ loadType: 'plate' })}
            />
          </View>
          {isPlate && (
            <View style={styles.sled}>
              <Text style={[styles.label, { color: muted }]}>STARTING WEIGHT (SLED), OPTIONAL</Text>
              <View style={styles.sledRow}>
                <BuilderInput
                  value={draft.sled}
                  onChangeText={(sled) => patch({ sled })}
                  accessibilityLabel={`Starting weight in ${weightUnit}`}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  style={styles.sledInput}
                />
                <Text style={[styles.unit, { color: muted }]}>{weightUnit}</Text>
              </View>
              {draft.sled.trim() !== '' && parseDecimal(draft.sled) === null && (
                <Text style={[styles.hint, { color: muted }]}>Enter a number, for example 20.</Text>
              )}
            </View>
          )}
        </>
      );
      break;
    case 'name':
      body = (
        <>
          <BuilderInput
            value={draft.name}
            onChangeText={(name) => setDraft((d) => setDraftName(d, name))}
            accessibilityLabel="Exercise name"
            placeholder="e.g. Chest press"
            autoFocus
            autoCapitalize="sentences"
            returnKeyType="done"
          />
          {showSuggestions && (
            <>
              <Text style={[styles.label, { color: muted }]}>
                SIMILAR BUILT-IN EXERCISES · TAP TO COPY MUSCLES AND LOGGING
              </Text>
              <View style={[styles.suggestCard, { backgroundColor: card }]}>
                {suggestions.map((s, i) => (
                  <Pressable
                    key={s.id}
                    onPress={() => setDraft((d) => applySuggestion(d, s))}
                    accessibilityRole="button"
                    accessibilityLabel={`${s.name}. Copy muscles and logging`}
                    style={[
                      styles.suggestRow,
                      i < suggestions.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: separator,
                      },
                    ]}
                  >
                    <Text style={[styles.suggestName, { color: text }]}>{s.name}</Text>
                    <Text style={[styles.suggestMuscles, { color: muted }]}>
                      {s.primary_muscles.map((m) => MUSCLE_LABELS[m]).join(', ')}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
          {draft.copiedFrom ? (
            <Text style={[styles.hint, { color: muted }]}>
              {`Muscles and logging copied from ${draft.copiedFrom}. You can change them next.`}
            </Text>
          ) : null}
        </>
      );
      break;
    case 'muscles':
      body = (
        <>
          <Text style={[styles.label, { color: muted }]}>PRIMARY · AT LEAST ONE</Text>
          <View style={styles.chips}>
            {MUSCLE_GROUPS.map((m) => (
              <ChipToggle
                key={m}
                label={MUSCLE_LABELS[m]}
                selected={draft.primary.includes(m)}
                onPress={() => setDraft((d) => toggleMuscle(d, 'primary', m))}
              />
            ))}
          </View>
          <Text style={[styles.label, styles.labelGap, { color: muted }]}>SECONDARY · OPTIONAL</Text>
          <View style={styles.chips}>
            {MUSCLE_GROUPS.map((m) => (
              <ChipToggle
                key={m}
                label={MUSCLE_LABELS[m]}
                selected={draft.secondary.includes(m)}
                onPress={() => setDraft((d) => toggleMuscle(d, 'secondary', m))}
              />
            ))}
          </View>
        </>
      );
      break;
    case 'logtype':
      body = (
        <>
          <View style={styles.stack} accessibilityRole="radiogroup">
            {LOG_TYPE_OPTIONS.map((o) => (
              <OptionCard
                key={o.id}
                label={o.label}
                description={o.desc}
                selected={draft.logType === o.id}
                onPress={() => setDraft((d) => applyLogType(d, o.id))}
              />
            ))}
          </View>
          {isRepLogType(draft.logType) && (
            <Pressable
              onPress={() => patch({ perSide: !draft.perSide })}
              accessibilityRole="switch"
              accessibilityLabel="Per side"
              accessibilityState={{ checked: draft.perSide }}
              style={[styles.switchRow, { backgroundColor: card }]}
            >
              <View style={styles.switchText}>
                <Text style={[styles.optionTitle, { color: text }]}>Per side</Text>
                <Text style={[styles.meta, { color: muted }]}>One arm or leg at a time; reps are per side</Text>
              </View>
              <Switch
                value={draft.perSide}
                onValueChange={(perSide) => patch({ perSide })}
                trackColor={{ false: muted, true: tint }}
                thumbColor={background}
                ios_backgroundColor={muted}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
            </Pressable>
          )}
        </>
      );
      break;
    case 'notes':
      body = (
        <>
          <Text style={[styles.hint, { color: muted }]}>
            Optional. Shown under the exercise every time you log it.
          </Text>
          <BuilderInput
            value={draft.notes}
            onChangeText={(notes) => patch({ notes })}
            accessibilityLabel="Setup notes"
            placeholder="e.g. Seat 4, back pad 2"
            multiline
            textAlignVertical="top"
            style={styles.notes}
          />
        </>
      );
      break;
    case 'review': {
      const rows = reviewRows(draft, weightUnit);
      body = (
        <>
          <View style={styles.reviewHead}>
            <Text style={[styles.label, { color: muted }]}>YOUR EXERCISE</Text>
            <Text style={[styles.question, { color: text }]}>{draftDisplayName(draft)}</Text>
            <Text style={[styles.meta, { color: muted }]}>
              {`${draft.equipment ? EQUIPMENT_LABELS[draft.equipment] : ''} · tap any line to change it`}
            </Text>
          </View>
          <View style={[styles.reviewCard, { backgroundColor: card }]}>
            {rows.map((r, i) => (
              <ReviewRow
                key={r.step}
                label={r.label}
                value={r.value}
                last={i === rows.length - 1}
                onPress={() => goTo(r.step)}
              />
            ))}
          </View>
          {isPlate && (
            <Text style={[styles.note, { color: muted }]}>Volume counts the plates you log, not the sled.</Text>
          )}
          {editing && (
            <Pressable
              onPress={confirmDelete}
              accessibilityRole="button"
              style={[styles.ghost, styles.deleteButton, { borderColor: fieldBorder }]}
            >
              <Text style={[styles.ghostText, { color: tint }]}>Delete exercise</Text>
            </Pressable>
          )}
        </>
      );
      break;
    }
  }

  const label = primaryLabel(draft, step, editing);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={styles.headerSide}
        >
          <Text style={[styles.headerButton, { color: tint }]}>Cancel</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: text }]} accessibilityRole="header">
          {editing ? 'Edit exercise' : 'New exercise'}
        </Text>
        <View style={styles.headerSide} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <StepProgress step={index + 1} total={steps.length} />
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {step !== 'review' && (
            <Text style={[styles.question, { color: text }]} accessibilityRole="header">
              {questionFor(step)}
            </Text>
          )}
          {body}
        </ScrollView>

        <View style={[styles.footer, styles.footerRule, { borderTopColor: separator }]}>
          {index > 0 && (
            <Pressable
              onPress={() => setStepId(steps[index - 1])}
              accessibilityRole="button"
              style={[styles.ghost, { borderColor: fieldBorder }]}
            >
              <Text style={[styles.ghostText, { color: tint }]}>Back</Text>
            </Pressable>
          )}
          <Pressable
            onPress={onNext}
            disabled={!valid || saving}
            accessibilityRole="button"
            accessibilityState={{ disabled: !valid || saving }}
            style={[styles.primary, styles.primaryGrow, { backgroundColor: tint, opacity: !valid || saving ? 0.5 : 1 }]}
          >
            <Text style={[styles.primaryText, { color: background }]}>{label}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  padded: { padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8 },
  headerSide: { width: 80, minHeight: 44, justifyContent: 'center' },
  headerButton: { fontSize: 17 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  body: { padding: 16, gap: 16 },
  question: { fontSize: 22, fontWeight: '700', lineHeight: 26 },
  hint: { fontSize: 15, lineHeight: 22 },
  label: { fontSize: 12, fontWeight: '500', letterSpacing: 0.4 },
  labelGap: { marginTop: 8 },
  meta: { fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'] },
  note: { fontSize: 13, lineHeight: 18 },
  stack: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sled: { gap: 6 },
  sledRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sledInput: { width: 120, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 17 },
  suggestCard: { borderRadius: 18, paddingHorizontal: 16 },
  suggestRow: {
    minHeight: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  suggestName: { fontSize: 15, flexShrink: 1 },
  suggestMuscles: { fontSize: 12 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  switchText: { flex: 1, gap: 2 },
  optionTitle: { fontSize: 17, fontWeight: '600' },
  notes: { height: 120, paddingTop: 12 },
  reviewHead: { gap: 4 },
  reviewCard: { borderRadius: 18, paddingHorizontal: 16 },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  footerRule: { borderTopWidth: StyleSheet.hairlineWidth },
  primary: { minHeight: 48, borderRadius: 18, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' },
  primaryGrow: { flex: 1 },
  primaryText: { fontSize: 17, fontWeight: '600' },
  ghost: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostText: { fontSize: 17, fontWeight: '600' },
  deleteButton: { alignSelf: 'flex-start' },
  savedBody: { flex: 1, padding: 16, gap: 16, justifyContent: 'center' },
  savedCard: { borderRadius: 18, padding: 20, gap: 6 },
});
