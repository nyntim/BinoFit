import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ChipToggle } from '@/components/workouts/ChipToggle';
import { ExerciseRow } from '@/components/workouts/ExerciseRow';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useExercises } from '@/hooks/useExercises';
import { syncToSupabase } from '@/lib/sync';
import { COMMON_MACHINE_BRANDS } from '@/lib/workouts/exercise-builder';
import { SEED_ALIASES } from '@/lib/workouts/machine-seed';
import { addExerciseToWorkout } from '@/lib/workouts/previous';
import { addExerciseToRoutine } from '@/lib/workouts/routines';
import {
  EQUIPMENT_LABELS,
  REGIONS,
  exerciseDisplayName,
  exerciseSubtitle,
  filterExercises,
  splitSections,
  type Region,
} from '@/lib/workouts/exercise-catalog';
import type { Exercise } from '@/lib/types';

export default function ExerciseLibraryScreen() {
  const params = useLocalSearchParams<{ pick?: string; workoutId?: string; routineId?: string }>();
  const workoutId = typeof params.workoutId === 'string' && params.workoutId ? params.workoutId : undefined;
  const routineId = typeof params.routineId === 'string' && params.routineId ? params.routineId : undefined;
  const pick = !!params.pick && (!!workoutId || !!routineId);

  const { exercises, status, reload } = useExercises();
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<Region>('All');
  const [brand, setBrand] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const card = useThemeColor({}, 'cardBackground');
  const subtle = useThemeColor({}, 'cardSecondary');
  const tint = useThemeColor({}, 'tint');
  const fieldBorder = useThemeColor({}, 'fieldBorder');

  const results = useMemo(() => filterExercises(exercises, { query, region, brand, aliases: SEED_ALIASES }),
    [exercises, query, region, brand]);
  const { yours, all } = useMemo(() => splitSections(results), [results]);
  const trimmed = query.trim();

  const openBuilder = (name?: string) => {
    const p: Record<string, string> = {};
    if (name) p.name = name;
    if (pick && routineId) p.routineId = routineId;
    else if (pick && workoutId) p.workoutId = workoutId;
    router.push({ pathname: '/workout/new-exercise', params: p });
  };

  const onPressExercise = async (e: Exercise) => {
    if (pick && routineId) {
      if (adding) return;
      setAdding(true);
      try {
        await addExerciseToRoutine(routineId, e.id);
        syncToSupabase();
        router.back();
      } catch {
        setAdding(false);
        Alert.alert('Couldn’t add the exercise', 'Try again.');
      }
      return;
    }
    if (pick && workoutId) {
      if (adding) return;
      setAdding(true);
      try {
        await addExerciseToWorkout(workoutId, e.id);
        router.back();
      } catch {
        setAdding(false);
        Alert.alert('Couldn’t add the exercise', 'Try again.');
      }
      return;
    }
    if (e.source === 'custom') router.push({ pathname: '/workout/new-exercise', params: { id: e.id } });
  };

  const renderSection = (title: string, list: Exercise[]) => (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: muted }]} accessibilityRole="header">
        {title.toUpperCase()}
      </Text>
      <View style={[styles.card, { backgroundColor: card }]}>
        {list.map((e, i) => (
          <ExerciseRow
            key={e.id}
            title={exerciseDisplayName(e)}
            subtitle={exerciseSubtitle(e)}
            tag={EQUIPMENT_LABELS[e.equipment]}
            last={i === list.length - 1}
            onPress={pick || e.source === 'custom' ? () => onPressExercise(e) : undefined}
          />
        ))}
      </View>
    </View>
  );

  let body: React.ReactNode;
  if (status === 'error') {
    body = (
      <View style={styles.message}>
        <Text style={[styles.messageText, { color: muted }]}>Couldn’t load exercises.</Text>
        <Pressable
          onPress={reload}
          accessibilityRole="button"
          style={[styles.retry, { borderColor: fieldBorder }]}
        >
          <Text style={[styles.retryText, { color: tint }]}>Retry</Text>
        </Pressable>
      </View>
    );
  } else if (status === 'loading') {
    body = null;
  } else if (results.length === 0 && trimmed) {
    body = (
      <View style={styles.message}>
        <Text style={[styles.messageText, { color: muted }]}>{`No exercises match “${trimmed}”.`}</Text>
        <Pressable
          onPress={() => openBuilder(trimmed)}
          accessibilityRole="button"
          style={[styles.createCard, { backgroundColor: card }]}
        >
          <View style={[styles.plusBox, { backgroundColor: tint }]}>
            <IconSymbol name="plus" size={22} color={background} />
          </View>
          <View style={styles.createText}>
            <Text style={[styles.createTitle, { color: text }]}>{`Create “${trimmed}”`}</Text>
            <Text style={[styles.createSub, { color: muted }]}>
              Add the machine, its brand and your seat settings
            </Text>
          </View>
        </Pressable>
      </View>
    );
  } else if (results.length === 0) {
    body = (
      <View style={styles.message}>
        <Text style={[styles.messageText, { color: muted }]}>
          {brand ? `No ${brand} machines in this group.` : 'No exercises in this group.'}
        </Text>
      </View>
    );
  } else {
    body = (
      <>
        {yours.length > 0 && renderSection('Your exercises', yours)}
        {all.length > 0 && renderSection('All exercises', all)}
      </>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.iconButton}
        >
          <IconSymbol name="chevron.left" size={22} color={tint} />
        </Pressable>
        <Text style={[styles.title, { color: text }]} accessibilityRole="header">
          Exercises
        </Text>
        <Pressable
          onPress={() => openBuilder()}
          accessibilityRole="button"
          accessibilityLabel="New exercise"
          style={[styles.newButton, { backgroundColor: tint }]}
        >
          <Text style={[styles.newButtonText, { color: background }]}>+ New exercise</Text>
        </Pressable>
      </View>

      <View style={styles.filters}>
        <View style={[styles.search, { backgroundColor: subtle }]}>
          <IconSymbol name="magnifyingglass" size={18} color={muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search exercises"
            placeholderTextColor={muted}
            selectionColor={tint}
            accessibilityLabel="Search exercises"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
            style={[styles.searchInput, { color: text }]}
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.chips}
          accessibilityRole="radiogroup"
          accessibilityLabel="Muscle group"
        >
          {REGIONS.map((r) => (
            <ChipToggle key={r} label={r} role="radio" size="compact" selected={region === r} onPress={() => setRegion(r)} />
          ))}
        </ScrollView>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.chips}
          accessibilityRole="radiogroup"
          accessibilityLabel="Brand"
        >
          <ChipToggle label="All brands" role="radio" size="compact" selected={brand === null} onPress={() => setBrand(null)} />
          {COMMON_MACHINE_BRANDS.map((b) => (
            <ChipToggle key={b} label={b} role="radio" size="compact" selected={brand === b} onPress={() => setBrand(b)} />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {body}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 4, paddingRight: 8, paddingTop: 4 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 22, fontWeight: '700' },
  newButton: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newButtonText: { fontSize: 15, fontWeight: '600' },
  filters: { paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  chips: { gap: 8, paddingRight: 16 },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  section: { gap: 10 },
  sectionLabel: { fontSize: 12, fontWeight: '500', letterSpacing: 0.4, paddingHorizontal: 4 },
  card: { borderRadius: 18, paddingVertical: 4, paddingHorizontal: 16 },
  message: { paddingVertical: 8, gap: 16 },
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
  createCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 16 },
  plusBox: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  createText: { flex: 1, gap: 2 },
  createTitle: { fontSize: 17, fontWeight: '600' },
  createSub: { fontSize: 13 },
});
