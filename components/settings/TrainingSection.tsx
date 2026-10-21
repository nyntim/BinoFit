import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { usePreferences } from '@/hooks/usePreferences';
import { getPreferences, setDefaultSetCount, setShowRpe } from '@/lib/app-preferences';
import { MAX_DEFAULT_SET_COUNT, MIN_DEFAULT_SET_COUNT } from '@/lib/workouts/prefill';

export function TrainingSection() {
  const { showRpe, defaultSetCount } = usePreferences();
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const card = useThemeColor({}, 'cardBackground');
  const subtle = useThemeColor({}, 'cardSecondary');
  const tint = useThemeColor({}, 'tint');
  const background = useThemeColor({}, 'background');

  return (
    <View style={styles.section}>
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
            void setShowRpe(v).catch(() => undefined);
          }}
          trackColor={{ false: muted, true: tint }}
          thumbColor={background}
          ios_backgroundColor={muted}
          accessibilityLabel="Show RPE"
        />
      </View>

      <View style={[styles.row, { backgroundColor: card }]}>
        <View style={styles.info}>
          <Text style={[styles.label, { color: text }]}>Default sets</Text>
          <Text style={[styles.subtitle, { color: muted }]}>
            Added when an exercise has no previous sets.
          </Text>
        </View>
        <View style={[styles.stepper, { backgroundColor: subtle }]}>
          <TouchableOpacity
            style={styles.stepperButton}
            onPress={() => {
              const current = getPreferences().defaultSetCount;
              if (current > MIN_DEFAULT_SET_COUNT) void setDefaultSetCount(current - 1).catch(() => undefined);
            }}
            disabled={defaultSetCount <= MIN_DEFAULT_SET_COUNT}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Fewer default sets"
            accessibilityState={{ disabled: defaultSetCount <= MIN_DEFAULT_SET_COUNT }}
          >
            <Text style={[styles.stepperSymbol, { color: muted }]}>−</Text>
          </TouchableOpacity>
          <Text
            style={[styles.stepperValue, { color: text }]}
            accessibilityLabel={`Default sets, ${defaultSetCount}`}
          >
            {defaultSetCount}
          </Text>
          <TouchableOpacity
            style={styles.stepperButton}
            onPress={() => {
              const current = getPreferences().defaultSetCount;
              if (current < MAX_DEFAULT_SET_COUNT) void setDefaultSetCount(current + 1).catch(() => undefined);
            }}
            disabled={defaultSetCount >= MAX_DEFAULT_SET_COUNT}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="More default sets"
            accessibilityState={{ disabled: defaultSetCount >= MAX_DEFAULT_SET_COUNT }}
          >
            <Text style={[styles.stepperSymbol, { color: muted }]}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 28 },
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
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    padding: 3,
  },
  stepperButton: {
    minHeight: 44,
    minWidth: 44,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperSymbol: { fontSize: 20, fontWeight: '600', lineHeight: 22 },
  stepperValue: { fontSize: 16, fontWeight: '600', minWidth: 28, textAlign: 'center' },
});
