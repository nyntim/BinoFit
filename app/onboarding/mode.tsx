import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { usePreferences } from '@/hooks/usePreferences';
import { setTrackingMode } from '@/lib/app-preferences';
import { setOnboardingComplete } from '@/lib/storage';
import { homeRouteFor } from '@/lib/tracking-mode';
import type { TrackingMode } from '@/lib/types';

const OPTIONS: { value: TrackingMode; label: string; description: string }[] = [
  { value: 'nutrition', label: 'Nutrition', description: 'Meals, calories and macros. Next: set your goals.' },
  {
    value: 'training',
    label: 'Training',
    description: 'Workouts, sets and your own exercises. No calorie goals needed.',
  },
  { value: 'both', label: 'Both', description: 'Everything, with training shown next to what you eat.' },
];

export default function ModeScreen() {
  const { trackingMode } = usePreferences();
  const [selected, setSelected] = useState<TrackingMode>(trackingMode);
  const [busy, setBusy] = useState(false);
  const text = useThemeColor({}, 'text');
  const icon = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const background = useThemeColor({}, 'background');
  const card = useThemeColor({}, 'cardBackground');
  const fieldBorder = useThemeColor({}, 'fieldBorder');

  async function handleContinue() {
    if (busy) return;
    setBusy(true);
    try {
      await setTrackingMode(selected);
      if (selected === 'training') {
        await setOnboardingComplete();
        router.replace(homeRouteFor('training'));
      } else {
        router.push('/onboarding/goals' as any);
      }
    } catch {
      Alert.alert("Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: text }]} accessibilityRole="header">
            What do you want to track?
          </Text>
          <Text style={[styles.subtitle, { color: icon }]}>You can change this later in More.</Text>
        </View>
        <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel="What to track">
          {OPTIONS.map((opt) => {
            const on = selected === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.option, { backgroundColor: card, borderColor: on ? tint : 'transparent' }]}
                onPress={() => setSelected(opt.value)}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${opt.label}. ${opt.description}`}
              >
                <View
                  style={[
                    styles.radio,
                    on ? { borderWidth: 7, borderColor: tint } : { borderWidth: 2, borderColor: fieldBorder },
                  ]}
                />
                <View style={styles.optionText}>
                  <Text style={[styles.optionLabel, { color: text }]}>{opt.label}</Text>
                  <Text style={[styles.optionDescription, { color: icon }]}>{opt.description}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: tint }]}
          onPress={handleContinue}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ busy }}
        >
          <Text style={[styles.buttonText, { color: background }]}>Continue</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 64, paddingBottom: 16, gap: 24 },
  header: { gap: 8 },
  title: { fontSize: 34, fontWeight: '700', lineHeight: 37, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, lineHeight: 22 },
  options: { gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 44,
    borderWidth: 1.5,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  radio: { width: 22, height: 22, borderRadius: 11 },
  optionText: { flex: 1, gap: 2 },
  optionLabel: { fontSize: 17, fontWeight: '600' },
  optionDescription: { fontSize: 13, lineHeight: 18 },
  footer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  button: {
    minHeight: 48,
    borderRadius: 18,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 17, fontWeight: '600' },
});
