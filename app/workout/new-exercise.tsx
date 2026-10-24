import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { IconTile } from '@/components/ui/IconTile';
import { ListGroup } from '@/components/ui/ListGroup';
import { SheetHeader } from '@/components/ui/SheetHeader';
import { Tag } from '@/components/ui/Tag';
import type { IconSymbolName } from '@/components/ui/icon-symbol';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { BuilderInput } from '@/components/workouts/BuilderInput';
import { ChipToggle } from '@/components/workouts/ChipToggle';
import { OptionCard } from '@/components/workouts/OptionCard';
import { ReviewRow } from '@/components/workouts/ReviewRow';
import { StepBar, StepCaption } from '@/components/workouts/StepProgress';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useExercises } from '@/hooks/useExercises';
import { useKeyboardOverlap } from '@/hooks/useKeyboardOverlap';
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
  brandChips,
  builderSteps,
  draftDisplayName,
  draftSummary,
  draftToExerciseInput,
  emptyDraft,
  exerciseToDraft,
  hasBrandStep,
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
import type { Equipment, Exercise } from '@/lib/types';

type Saved = { name: string; summary: string; notes: string; addedTo: string | null };

const EQUIPMENT_ICONS: Record<Equipment, IconSymbolName> = {
  machine: 'square.grid.2x2',
  cable: 'figure.strengthtraining.traditional',
  barbell: 'scalemass',
  dumbbell: 'dumbbell.fill',
  bodyweight: 'figure.walk',
  cardio_machine: 'figure.run',
  other: 'square.grid.2x2',
};

export default function NewExerciseScreen() {
  const params = useLocalSearchParams<{ id?: string; name?: string; workoutId?: string; routineId?: string }>();
  const editId = typeof params.id === 'string' && params.id ? params.id : undefined;
  const workoutId = typeof params.workoutId === 'string' && params.workoutId ? params.workoutId : undefined;
  const routineId = typeof params.routineId === 'string' && params.routineId ? params.routineId : undefined;
  const prefillName = typeof params.name === 'string' ? params.name : '';

  const { weightUnit } = usePreferences();
  const { brands } = useExercises();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const rootRef = useRef<View>(null);
  const keyboardOverlap = useKeyboardOverlap(rootRef);
  const rootStyle = [
    styles.container,
    { paddingTop: insets.top, paddingBottom: keyboardOverlap > 0 ? 0 : insets.bottom },
  ];
  const footerLift = { paddingBottom: keyboardOverlap > 0 ? keyboardOverlap + 12 : 12 };

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
  const separator = useThemeColor({}, 'separator');
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
      <View ref={rootRef} style={[rootStyle, { backgroundColor: background }]}>
        <View style={styles.savedBody}>
          <ThemedText type="section">Saved to your exercises</ThemedText>
          <Card style={styles.savedCard}>
            <ThemedText type="heading" style={styles.savedName}>{saved.name}</ThemedText>
            <Text style={[styles.meta, { color: muted }]}>{saved.summary}</Text>
            {saved.notes ? <Text style={[styles.meta, { color: muted }]}>{saved.notes}</Text> : null}
          </Card>
          {saved.addedTo ? <Text style={[styles.hint, { color: muted }]}>{`Added to ${saved.addedTo}.`}</Text> : null}
        </View>
        <View style={[styles.footer, footerLift]}>
          <Button size="lg" label="Done" onPress={onDone} style={styles.primaryGrow} />
        </View>
      </View>
    );
  }

  if (loadState !== 'ready') {
    return (
      <View ref={rootRef} style={[rootStyle, { backgroundColor: background }]}>
        <SheetHeader title="" onCancel={() => router.back()} />
        {loadState === 'missing' ? (
          <Text style={[styles.hint, styles.padded, { color: muted }]}>Couldn’t find this exercise.</Text>
        ) : null}
      </View>
    );
  }

  // ── Step bodies ────────────────────────────────────────────────
  const suggestions = nameSuggestions(draft.name, SEED_EXERCISES);
  const showSuggestions = suggestions.length > 0 && !draft.copiedFrom;
  const isPlate = isPlateLoaded(draft);
  const chips = brandChips(brands);

  const questionFor = (id: BuilderStepId) =>
    ({
      equipment: 'What equipment is it?',
      brand: 'Which brand is it?',
      loading: 'How is it loaded?',
      name: 'What’s the exercise called?',
      muscles: 'Which muscles does it work?',
      logtype: 'How do you log it?',
      notes: 'Any setup notes?',
      review: '',
    })[id];

  const helperFor = (id: BuilderStepId): string | null =>
    ({
      equipment: 'This decides the next questions, like brand and how it loads.',
      brand: 'Optional. It goes in the name so you can tell machines apart.',
      muscles: `${draftDisplayName(draft)}. Pick at least one main muscle, then any helpers.`,
      notes: 'Optional. Shown under the exercise every time you log it.',
    } as Partial<Record<BuilderStepId, string>>)[id] ?? null;

  let body: React.ReactNode = null;
  switch (step) {
    case 'equipment': {
      const pairs: Equipment[][] = [];
      for (let i = 0; i < EQUIPMENT_OPTIONS.length; i += 2) pairs.push(EQUIPMENT_OPTIONS.slice(i, i + 2));
      body = (
        <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="Equipment">
          {pairs.map((pair) => (
            <View key={pair[0]} style={styles.gridRow}>
              {pair.map((eq) => (
                <OptionCard
                  key={eq}
                  layout="tile"
                  icon={EQUIPMENT_ICONS[eq]}
                  label={EQUIPMENT_LABELS[eq]}
                  selected={draft.equipment === eq}
                  onPress={() => setDraft((d) => applyEquipment(d, eq))}
                />
              ))}
              {pair.length === 1 ? <View style={styles.gridSpacer} /> : null}
            </View>
          ))}
        </View>
      );
      break;
    }
    case 'brand':
      body = (
        <>
          <BuilderInput
            value={draft.brand}
            onChangeText={(brand) => patch({ brand })}
            accessibilityLabel="Brand"
            placeholder="e.g. Hammer Strength"
            autoCapitalize="words"
            returnKeyType="done"
          />
          {chips.used.length > 0 && (
            <>
              <ThemedText type="section">Brands you’ve used</ThemedText>
              <View style={styles.chips}>
                {chips.used.map((b) => (
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
          <ThemedText type="section">Common brands</ThemedText>
          <View style={styles.chips}>
            {chips.common.map((b) => (
              <ChipToggle
                key={b}
                label={b}
                selected={draft.brand.trim().toLowerCase() === b.toLowerCase()}
                onPress={() => patch({ brand: b })}
              />
            ))}
          </View>
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
              <ThemedText type="section">Starting weight (sled), optional</ThemedText>
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
              <ThemedText type="section">Similar built-in exercises · tap to copy</ThemedText>
              <ListGroup>
                {suggestions.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => setDraft((d) => applySuggestion(d, s))}
                    accessibilityRole="button"
                    accessibilityLabel={`${s.name}. Use name, muscles and logging`}
                    style={styles.suggestRow}
                  >
                    <Text style={[styles.suggestName, { color: text }]}>{s.name}</Text>
                    <Text style={[styles.suggestMuscles, { color: muted }]}>
                      {s.primary_muscles.map((m) => MUSCLE_LABELS[m] ?? m).join(', ')}
                    </Text>
                  </Pressable>
                ))}
              </ListGroup>
            </>
          )}
          {draft.copiedFrom ? (
            <Text style={[styles.hint, { color: muted }]}>
              {`Name, muscles and logging copied from ${draft.copiedFrom}. You can change them next.`}
            </Text>
          ) : null}
          {isRepLogType(draft.logType) && (
            <Pressable
              onPress={() => patch({ perSide: !draft.perSide })}
              accessibilityRole="switch"
              accessibilityLabel="Per side / unilateral"
              accessibilityState={{ checked: draft.perSide }}
              style={styles.switchPress}
            >
              <Card padding="compact" style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={[styles.optionTitle, { color: text }]}>Per side / unilateral</Text>
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
              </Card>
            </Pressable>
          )}
        </>
      );
      break;
    case 'muscles':
      body = (
        <>
          <ThemedText type="section">Main muscles</ThemedText>
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
          <ThemedText type="section" style={styles.labelGap}>Also works (optional)</ThemedText>
          <View style={styles.chips}>
            {MUSCLE_GROUPS.map((m) => (
              <ChipToggle
                key={m}
                label={MUSCLE_LABELS[m]}
                tone="soft"
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
        </>
      );
      break;
    case 'notes':
      body = (
        <>
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
      const nameRow = rows.find((r) => r.step === 'name' && r.label === 'Name');
      const muscleRow = rows.find((r) => r.step === 'muscles');
      const rest = rows.filter((r) => r !== nameRow && r !== muscleRow);
      const brand = hasBrandStep(draft.equipment) ? draft.brand.trim() : '';
      body = (
        <>
          <Card style={styles.reviewCard}>
            <Pressable
              onPress={() => goTo('name')}
              accessibilityRole="button"
              accessibilityLabel={`Name: ${nameRow?.value ?? ''}. Change`}
              style={styles.reviewHead}
            >
              <IconTile icon={draft.equipment ? EQUIPMENT_ICONS[draft.equipment] : 'dumbbell.fill'} size={52} />
              <View style={styles.reviewTitles}>
                <ThemedText type="heading" style={styles.reviewName}>{draft.name.trim() || 'Untitled'}</ThemedText>
                {brand ? <ThemedText type="label" style={{ color: muted }}>{brand}</ThemedText> : null}
              </View>
              {draft.equipment ? <Tag label={EQUIPMENT_LABELS[draft.equipment]} tone="tint" /> : null}
            </Pressable>
            <Pressable
              onPress={() => goTo('muscles')}
              accessibilityRole="button"
              accessibilityLabel={`Muscles: ${muscleRow?.value ?? ''}. Change`}
              style={styles.chips}
            >
              {draft.primary.map((m) => (
                <Chip key={`p-${m}`} size="sm" selected label={MUSCLE_LABELS[m]} />
              ))}
              {draft.secondary.map((m) => (
                <Chip key={`s-${m}`} size="sm" label={MUSCLE_LABELS[m]} />
              ))}
            </Pressable>
          </Card>

          <ListGroup>
            {rest.map((r) => (
              <ReviewRow key={`${r.step}-${r.label}`} label={r.label} value={r.value} onPress={() => goTo(r.step)} />
            ))}
          </ListGroup>
          <ThemedText type="caption" style={styles.reviewCaption}>
            Tap any line to change it. Setup notes show under the name in every workout.
          </ThemedText>
          {isPlate && (
            <Text style={[styles.note, { color: muted }]}>Volume counts the plates you log, not the sled.</Text>
          )}
          {editing && <Button variant="danger" size="lg" label="Delete exercise" onPress={confirmDelete} />}
        </>
      );
      break;
    }
  }

  const label = primaryLabel(draft, step, editing);

  const helper = helperFor(step);

  return (
    <View ref={rootRef} style={[rootStyle, { backgroundColor: background }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={styles.headerSide}
        >
          <Text style={[styles.headerButton, { color: tint }]}>Cancel</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <StepCaption step={index + 1} total={steps.length} review={step === 'review'} />
        </View>
        <View style={styles.headerSide} />
      </View>
      <StepBar step={index + 1} total={steps.length} />

      <View style={styles.flex}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {step !== 'review' && (
            <View style={styles.headings}>
              <ThemedText type="heading" accessibilityRole="header">{questionFor(step)}</ThemedText>
              {helper ? <ThemedText type="body" style={{ color: muted }}>{helper}</ThemedText> : null}
            </View>
          )}
          {body}
        </ScrollView>

        <View style={[styles.footer, styles.footerRule, footerLift, { borderTopColor: separator }]}>
          {index > 0 && (
            <Button variant="secondary" size="lg" label="Back" fullWidth={false} style={styles.backButton} onPress={() => setStepId(steps[index - 1])} />
          )}
          <Button size="lg" label={label} disabled={!valid || saving} onPress={onNext} style={styles.primaryGrow} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  padded: { padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8 },
  headerSide: { width: 80, minHeight: 44, justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerButton: { fontSize: 17 },
  headings: { gap: 6 },
  body: { padding: 16, paddingTop: 22, gap: 16 },
  hint: { fontSize: 15, lineHeight: 22 },
  labelGap: { marginTop: 8 },
  meta: { fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'] },
  note: { fontSize: 13, lineHeight: 18 },
  stack: { gap: 8 },
  grid: { gap: 10 },
  gridRow: { flexDirection: 'row', gap: 10 },
  gridSpacer: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sled: { gap: 6 },
  sledRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sledInput: { width: 120, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 17 },
  suggestRow: {
    minHeight: 52,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  suggestName: { fontSize: 15, flexShrink: 1 },
  suggestMuscles: { fontSize: 12 },
  switchPress: { alignSelf: 'stretch' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  switchText: { flex: 1, gap: 2 },
  optionTitle: { fontSize: 17, fontWeight: '600' },
  notes: { height: 120, paddingTop: 12 },
  reviewCard: { gap: 12, padding: 20 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reviewTitles: { flex: 1, minWidth: 0, gap: 4 },
  reviewName: { fontSize: 22, lineHeight: 27 },
  reviewCaption: { paddingHorizontal: 4 },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12 },
  footerRule: { borderTopWidth: StyleSheet.hairlineWidth },
  backButton: { width: 110 },
  primaryGrow: { flex: 1 },
  savedBody: { flex: 1, padding: 16, gap: 16, justifyContent: 'center' },
  savedCard: { gap: 6 },
  savedName: { fontSize: 24, lineHeight: 29 },
});
