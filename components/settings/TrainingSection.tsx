import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { usePreferences } from '@/hooks/usePreferences';
import { setShowRpe, setTrackingMode, setWeightUnit } from '@/lib/app-preferences';
import type { TrackingMode, WeightUnit } from '@/lib/types';

const UNITS: { value: WeightUnit; label: string }[] = [
  { value: 'kg', label: 'kg' },
  { value: 'lb', label: 'lb' },
];

const MODES: { value: TrackingMode; label: string }[] = [
  { value: 'nutrition', label: 'Nutrition' },
  { value: 'training', label: 'Training' },
  { value: 'both', label: 'Both' },
];

type Props = {
  /** Whether calorie and macro goals are saved. Home needs them in Nutrition and Both. */
  hasGoals: boolean;
  onSetGoals: () => void;
};

export function TrainingSection({ hasGoals, onSetGoals }: Props) {
  const { trackingMode, weightUnit, showRpe } = usePreferences();
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const card = useThemeColor({}, 'cardBackground');
  const subtle = useThemeColor({}, 'cardSecondary');
  const tint = useThemeColor({}, 'tint');
  const background = useThemeColor({}, 'background');

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: text }]}>Training</Text>

      <View style={[styles.row, styles.stackedRow, { backgroundColor: card }]}>
        <View style={styles.stackedInfo}>
          <Text style={[styles.label, { color: text }]}>Track</Text>
          <Text style={[styles.subtitle, { color: muted }]}>
            Choose which tabs and goals the app shows.
          </Text>
        </View>
        <View
          style={[styles.switch, styles.stackedSwitch, { backgroundColor: subtle }]}
          accessibilityRole="radiogroup"
          accessibilityLabel="Track"
        >
          {MODES.map((opt) => {
            const selected = trackingMode === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.segment, styles.modeSegment, styles.stretch, selected && { backgroundColor: tint }]}
                onPress={() => {
                  if (!selected) setTrackingMode(opt.value);
                }}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.segmentText, { color: selected ? background : muted }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {trackingMode !== 'training' && !hasGoals && (
        <View style={[styles.row, styles.goalsCard, { backgroundColor: card }]}>
          <Text style={[styles.label, styles.goalsText, { color: text }]}>
            Home needs calorie and macro goals.
          </Text>
          <TouchableOpacity
            style={[styles.goalsButton, { backgroundColor: tint }]}
            onPress={onSetGoals}
            accessibilityRole="button"
          >
            <Text style={[styles.segmentText, { color: background }]}>Set goals</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.row, { backgroundColor: card }]}>
        <View style={styles.info}>
          <Text style={[styles.label, { color: text }]}>Units</Text>
          <Text style={[styles.subtitle, { color: muted }]}>
            Weight in kg with distance in km, or weight in lb with distance in mi.
          </Text>
        </View>
        <View
          style={[styles.switch, { backgroundColor: subtle }]}
          accessibilityRole="radiogroup"
          accessibilityLabel="Units"
        >
          {UNITS.map((opt) => {
            const selected = weightUnit === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.segment, selected && { backgroundColor: tint }]}
                onPress={() => {
                  if (!selected) setWeightUnit(opt.value);
                }}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.segmentText, { color: selected ? background : muted }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={[styles.row, { backgroundColor: card }]}>
        <View style={styles.info}>
          <Text style={[styles.label, { color: text }]}>Show RPE</Text>
          <Text style={[styles.subtitle, { color: muted }]}>
            Adds an effort rating (1 to 10) to each set.
          </Text>
        </View>
        <Switch
          value={showRpe}
          onValueChange={(v) => {
            setShowRpe(v);
          }}
          trackColor={{ false: muted, true: tint }}
          thumbColor={background}
          ios_backgroundColor={muted}
          accessibilityLabel="Show RPE"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  info: { flex: 1, marginRight: 16 },
  label: { fontSize: 16, fontWeight: '500' },
  subtitle: { fontSize: 12, marginTop: 4, lineHeight: 16 },
  switch: { flexDirection: 'row', borderRadius: 20, padding: 3 },
  segment: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 14,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeSegment: { paddingHorizontal: 10 },
  stretch: { flex: 1 },
  stackedRow: { flexDirection: 'column', alignItems: 'stretch' },
  stackedInfo: { marginBottom: 12 },
  stackedSwitch: { alignSelf: 'stretch' },
  goalsCard: { justifyContent: 'space-between' },
  goalsText: { flex: 1, marginRight: 16 },
  goalsButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentText: { fontSize: 13, fontWeight: '600' },
});
