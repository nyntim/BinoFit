import { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getUserGoals } from '@/lib/storage';
import type { UserGoals } from '@/lib/types';

type MacroRow = { label: string; value: number; unit: string; color: string };

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [goals, setGoals] = useState<UserGoals | null>(null);

  useEffect(() => {
    getUserGoals().then(setGoals);
  }, []);

  const macros: MacroRow[] = goals
    ? [
        { label: 'Protein', value: goals.protein_goal, unit: 'g', color: '#e74c3c' },
        { label: 'Carbs', value: goals.carb_goal, unit: 'g', color: '#f39c12' },
        { label: 'Fat', value: goals.fat_goal, unit: 'g', color: '#3498db' },
      ]
    : [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.greeting, { color: colors.icon }]}>Today</Text>
        <Text style={[styles.title, { color: colors.text }]}>Dashboard</Text>

        {goals ? (
          <>
            <View
              style={[
                styles.calorieCard,
                { backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#f2f2f7' },
              ]}
            >
              <Text style={[styles.calorieLabel, { color: colors.icon }]}>Daily Calorie Goal</Text>
              <Text style={[styles.calorieValue, { color: colors.tint }]}>
                {goals.calorie_goal.toLocaleString()}
              </Text>
              <Text style={[styles.calorieUnit, { color: colors.icon }]}>kcal</Text>
            </View>

            <View style={styles.macroRow}>
              {macros.map((m) => (
                <View
                  key={m.label}
                  style={[
                    styles.macroCard,
                    { backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#f2f2f7' },
                  ]}
                >
                  <View style={[styles.macroDot, { backgroundColor: m.color }]} />
                  <Text style={[styles.macroValue, { color: colors.text }]}>
                    {m.value}
                    <Text style={[styles.macroUnit, { color: colors.icon }]}>{m.unit}</Text>
                  </Text>
                  <Text style={[styles.macroLabel, { color: colors.icon }]}>{m.label}</Text>
                </View>
              ))}
            </View>

            <View
              style={[
                styles.phaseNotice,
                { backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#f2f2f7' },
              ]}
            >
              <Text style={[styles.phaseTitle, { color: colors.text }]}>Coming in Phase 2</Text>
              <Text style={[styles.phaseText, { color: colors.icon }]}>
                Food logging, meal slots, and daily nutrition summary will be added next.
              </Text>
            </View>
          </>
        ) : (
          <Text style={[styles.loading, { color: colors.icon }]}>Loading your goals…</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 24 },
  greeting: { fontSize: 15, fontWeight: '500', marginBottom: 4 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 24 },
  loading: { fontSize: 16, textAlign: 'center', marginTop: 48 },
  calorieCard: {
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  calorieLabel: { fontSize: 13, fontWeight: '500', marginBottom: 8 },
  calorieValue: { fontSize: 48, fontWeight: '700', lineHeight: 52 },
  calorieUnit: { fontSize: 15, marginTop: 4 },
  macroRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  macroCard: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 4,
  },
  macroDot: { width: 8, height: 8, borderRadius: 4 },
  macroValue: { fontSize: 20, fontWeight: '700' },
  macroUnit: { fontSize: 13, fontWeight: '400' },
  macroLabel: { fontSize: 12 },
  phaseNotice: { borderRadius: 14, padding: 16 },
  phaseTitle: { fontSize: 15, fontWeight: '600', marginBottom: 6 },
  phaseText: { fontSize: 14, lineHeight: 20 },
});
