import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconTile } from '@/components/ui/IconTile';
import { ListGroup } from '@/components/ui/ListGroup';
import { SearchField } from '@/components/ui/SearchField';
import { SheetHeader } from '@/components/ui/SheetHeader';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ChipToggle } from '@/components/workouts/ChipToggle';
import { ExerciseRow } from '@/components/workouts/ExerciseRow';
import { NavIconButton, WorkoutNavBar } from '@/components/workouts/WorkoutNavBar';
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
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'onTint');

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
      <ThemedText type="section" accessibilityRole="header">{title}</ThemedText>
      <ListGroup>
        {list.map((e) => (
          <ExerciseRow
            key={e.id}
            title={exerciseDisplayName(e)}
            subtitle={exerciseSubtitle(e)}
            tag={EQUIPMENT_LABELS[e.equipment]}
            custom={e.source === 'custom'}
            onPress={pick || e.source === 'custom' ? () => onPressExercise(e) : undefined}
          />
        ))}
      </ListGroup>
    </View>
  );

  const createCard = (
    <Pressable
      onPress={() => openBuilder(trimmed)}
      accessibilityRole="button"
      accessibilityLabel={`Create “${trimmed}”`}
    >
      <Card padding="compact" style={styles.createCard}>
        <IconTile icon="plus" size={40} />
        <View style={styles.createText}>
          <ThemedText type="body" style={[styles.createTitle, { color: tint }]}>{`Create “${trimmed}”`}</ThemedText>
          <ThemedText type="caption">Add the machine, its brand and your seat settings</ThemedText>
        </View>
      </Card>
    </Pressable>
  );

  let body: React.ReactNode;
  if (status === 'error') {
    body = (
      <EmptyState
        image={false}
        title="Couldn’t load exercises."
        actions={<Button variant="secondary" label="Retry" onPress={reload} />}
      />
    );
  } else if (status === 'loading') {
    body = null;
  } else if (results.length === 0 && trimmed) {
    body = (
      <View style={styles.message}>
        <ThemedText type="body">{`No exercises match “${trimmed}”.`}</ThemedText>
        {createCard}
      </View>
    );
  } else if (results.length === 0) {
    body = (
      <View style={styles.message}>
        <ThemedText type="body">
          {brand ? `No ${brand} machines in this group.` : 'No exercises in this group.'}
        </ThemedText>
      </View>
    );
  } else {
    body = (
      <>
        {yours.length > 0 && renderSection('Yours', yours)}
        {all.length > 0 && renderSection(region === 'All' ? 'All exercises' : region, all)}
      </>
    );
  }

  const showPromo = !pick && status === 'ready' && !(results.length === 0 && trimmed);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      {pick ? (
        <SheetHeader title="Add exercises" onCancel={() => router.back()} />
      ) : (
        <WorkoutNavBar
          label="Training"
          onBack={() => router.back()}
          trailing={<NavIconButton icon="plus" label="New exercise" tone="tint" onPress={() => openBuilder()} />}
        />
      )}

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {pick ? null : <ThemedText type="largeTitle" accessibilityRole="header">Exercises</ThemedText>}
        <View style={[styles.filters, { backgroundColor: background }]}>
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Search exercises"
            accessibilityLabel="Search exercises"
            autoFocus={pick}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.chips}
            accessibilityRole="radiogroup"
            accessibilityLabel="Muscle group"
          >
            {REGIONS.map((r) => (
              <ChipToggle key={r} label={r} role="radio" selected={region === r} onPress={() => setRegion(r)} />
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
            <ChipToggle label="All brands" role="radio" size="compact" tone="ink" selected={brand === null} onPress={() => setBrand(null)} />
            {COMMON_MACHINE_BRANDS.map((b) => (
              <ChipToggle key={b} label={b} role="radio" size="compact" selected={brand === b} onPress={() => setBrand(b)} />
            ))}
          </ScrollView>
        </View>

        {showPromo ? (
          <Pressable onPress={() => openBuilder()} accessibilityRole="button" accessibilityLabel="New exercise">
            <Card tone="tint" padding="compact" style={styles.createCard}>
              <View style={[styles.promoTile, { backgroundColor: tint }]} accessible={false} importantForAccessibility="no-hide-descendants">
                <IconSymbol name="plus" size={22} color={onTint} />
              </View>
              <View style={styles.createText}>
                <ThemedText type="body" style={styles.createTitle}>New exercise</ThemedText>
                <ThemedText type="caption">Add the machine, its brand and your seat settings</ThemedText>
              </View>
            </Card>
          </Pressable>
        ) : null}
        {body}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filters: { gap: 10, paddingVertical: 4 },
  chips: { gap: 8, paddingRight: 16 },
  content: { paddingHorizontal: 16, gap: 14, paddingBottom: 40 },
  section: { gap: 8 },
  message: { gap: 16 },
  createCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  promoTile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  createText: { flex: 1, gap: 2 },
  createTitle: { fontWeight: '600' },
});
