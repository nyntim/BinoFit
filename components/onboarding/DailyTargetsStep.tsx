import { useEffect, useState, type Ref } from 'react';
import { AccessibilityInfo, StyleSheet, Text, TextInput, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/Card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { TextField } from '@/components/ui/TextField';
import { Fonts, MacroColors } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { targetsSummary, type MacroName } from '@/lib/onboarding-setup';

export type TargetsDraft = Record<'calories' | 'protein' | 'carbs' | 'fat', string>;

type Props = {
  /** Receives accessibility focus when the step opens. */
  headingRef: Ref<View>;
  values: TargetsDraft;
  onChange: (name: keyof TargetsDraft, value: string) => void;
  error: string | null;
};

const MACROS: { name: MacroName; title: string; label: string }[] = [
  { name: 'protein', title: 'Protein', label: 'Protein grams' },
  { name: 'carbs', title: 'Carbs', label: 'Carbs grams' },
  { name: 'fat', title: 'Fat', label: 'Fat grams' },
];

/** Body of the Daily targets step: calories, macros and the live energy split. State and saving live in goals.tsx. */
export function DailyTargetsStep({ headingRef, values, onChange, error }: Props) {
  const icon = useThemeColor({}, 'icon');
  const text = useThemeColor({}, 'text');
  const tint = useThemeColor({}, 'tint');
  const danger = useThemeColor({}, 'danger');
  const track = useThemeColor({}, 'track');
  const separator = useThemeColor({}, 'separator');
  const [calorieFocused, setCalorieFocused] = useState(false);
  const summary = targetsSummary(values);

  useEffect(() => {
    if (error) AccessibilityInfo.announceForAccessibility(error);
  }, [error]);

  return (
    <View style={styles.step}>
      <View style={styles.copy}>
        <View ref={headingRef} accessible accessibilityRole="header">
          <ThemedText type="heading">Your daily targets</ThemedText>
        </View>
        <ThemedText style={[styles.body, { color: icon }]}>Set a starting point for each day. Adjust anything.</ThemedText>
      </View>

      <Card padding="compact" style={[styles.calories, { borderColor: error ? danger : calorieFocused ? tint : 'transparent' }]}>
        <ThemedText type="label" style={{ color: icon }}>Calories</ThemedText>
        <View style={styles.calorieRow}>
          <TextInput
            value={values.calories}
            onChangeText={(v) => onChange('calories', v)}
            onFocus={() => setCalorieFocused(true)}
            onBlur={() => setCalorieFocused(false)}
            keyboardType="numeric"
            placeholder="2000"
            placeholderTextColor={icon}
            accessibilityLabel="Calories per day"
            style={[styles.calorieInput, { color: text }]}
          />
          <Text style={[styles.calorieSuffix, { color: icon }]} accessible={false}>cal a day</Text>
        </View>
      </Card>

      <Card padding="none">
        {MACROS.map(({ name, title, label }, index) => {
          const percent = summary.macros[name].percentOfCalories;
          return (
            <View key={name}>
              {index > 0 && <View style={[styles.rule, { backgroundColor: separator }]} />}
              <View style={styles.macroRow}>
                <View style={[styles.dot, { backgroundColor: MacroColors[name] }]} />
                <View style={styles.macroCopy}>
                  <ThemedText style={styles.macroName}>{title}</ThemedText>
                  <ThemedText type="caption">{percent === null ? '-- of calories' : `${percent}% of calories`}</ThemedText>
                </View>
                <TextField
                  size="mini"
                  suffix="g"
                  value={values[name]}
                  onChangeText={(v) => onChange(name, v)}
                  keyboardType="numeric"
                  accessibilityLabel={label}
                />
              </View>
            </View>
          );
        })}
      </Card>

      <View style={styles.bar} accessibilityRole="image" accessibilityLabel={summary.barLabel}>
        {summary.energyShares ? (
          (['protein', 'carbs', 'fat'] as const).map((name) => (
            <View key={name} style={[styles.segment, { flex: summary.energyShares![name], backgroundColor: MacroColors[name] }]} />
          ))
        ) : (
          <View style={[styles.segment, { flex: 1, backgroundColor: track }]} />
        )}
      </View>

      <ThemedText type="caption">
        Macros add up to {summary.macroCalories.toLocaleString('en-US')} cal. You can change targets any time in Settings.
      </ThemedText>

      {error && (
        <View style={styles.error} accessibilityLiveRegion="polite">
          <IconSymbol name="exclamationmark.circle" size={14} color={danger} />
          <Text style={[styles.errorText, { color: danger }]}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  step: { gap: 16 },
  copy: { gap: 8 },
  body: { fontSize: 17, lineHeight: 24 },
  calories: { borderWidth: 2, gap: 4 },
  calorieRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  calorieInput: { flexShrink: 1, minWidth: 96, fontFamily: Fonts.rounded, fontSize: 40, fontWeight: '800', fontVariant: ['tabular-nums'], paddingVertical: 4 },
  calorieSuffix: { fontSize: 15, fontWeight: '500' },
  rule: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  macroRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 64 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  macroCopy: { flex: 1, minWidth: 0 },
  macroName: { fontWeight: '600' },
  bar: { flexDirection: 'row', gap: 3, height: 10 },
  segment: { height: 10, borderRadius: 4 },
  error: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorText: { flexShrink: 1, fontSize: 13 },
});
