import { useEffect, useState, type ReactNode, type Ref } from 'react';
import { AccessibilityInfo, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/Card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ListGroup, ListRow } from '@/components/ui/ListGroup';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Fonts } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { ACTIVITY_OPTIONS, type StatsDraft } from '@/lib/onboarding-setup';
import type { WeightUnit } from '@/lib/types';

type Props = {
  /** Receives accessibility focus when the step opens. */
  headingRef: Ref<View>;
  unit: WeightUnit;
  onUnitChange: (unit: WeightUnit) => void;
  draft: StatsDraft;
  onChange: (patch: Partial<StatsDraft>) => void;
  error: { field: 'weight' | 'height'; message: string } | null;
};

/** A borderless number field inside a card; the card draws the focus and error border. */
function CardField({ suffix, style, onFocus, onBlur, flex, wrap, ...rest }: TextInputProps & { suffix: string; flex?: boolean; wrap?: boolean; style?: StyleProp<TextStyle> }) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  return (
    <View style={[styles.fieldRow, flex && styles.flex, wrap && styles.fieldWrap]}>
      <TextInput
        {...rest}
        placeholderTextColor={muted}
        onFocus={onFocus}
        onBlur={onBlur}
        style={[styles.input, { color: text }, style]}
      />
      <Text style={[styles.suffix, { color: muted }]} accessible={false}>{suffix}</Text>
    </View>
  );
}

function StatCard({ label, error, children }: { label: string; error: boolean; children: (focus: { onFocus: () => void; onBlur: () => void }) => ReactNode }) {
  const tint = useThemeColor({}, 'tint');
  const danger = useThemeColor({}, 'danger');
  const [focused, setFocused] = useState(false);
  const icon = useThemeColor({}, 'icon');
  const border = error ? danger : focused ? tint : 'transparent';
  return (
    <Card padding="compact" style={[styles.card, { borderColor: border }]}>
      <ThemedText type="label" style={{ color: icon }}>{label}</ThemedText>
      {children({ onFocus: () => setFocused(true), onBlur: () => setFocused(false) })}
    </Card>
  );
}

/** Body of the About you step: units, weight, height and activity. State and saving live in goals.tsx. */
export function AboutYouStep({ headingRef, unit, onUnitChange, draft, onChange, error }: Props) {
  const icon = useThemeColor({}, 'icon');
  const danger = useThemeColor({}, 'danger');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'onTint');
  const tintSoft = useThemeColor({}, 'tintSoft');
  const fieldBorder = useThemeColor({}, 'fieldBorder');
  const metric = unit === 'kg';

  useEffect(() => {
    if (error) AccessibilityInfo.announceForAccessibility(error.message);
  }, [error]);

  const weightLabel = metric ? 'Weight in kg' : 'Weight in lb';
  const hint = (field: 'weight' | 'height') => (error?.field === field ? error.message : undefined);

  return (
    <View style={styles.step}>
      <View style={styles.copy}>
        <View ref={headingRef} accessible accessibilityRole="header">
          <ThemedText type="heading">A little about you</ThemedText>
        </View>
        <ThemedText style={[styles.body, { color: icon }]}>
          Skip anything you&apos;d rather not share. You can change it later in Settings.
        </ThemedText>
      </View>

      <SegmentedControl
        accessibilityLabel="Units"
        value={unit}
        onChange={onUnitChange}
        options={[{ value: 'lb', label: 'Imperial' }, { value: 'kg', label: 'Metric' }]}
      />

      <View style={styles.cards}>
        <StatCard label="Weight" error={error?.field === 'weight'}>
          {(focus) => (
            <CardField
              {...focus}
              flex
              value={draft.weight}
              onChangeText={(weight) => onChange({ weight })}
              suffix={metric ? 'kg' : 'lb'}
              keyboardType="decimal-pad"
              placeholder={metric ? 'e.g. 75' : 'e.g. 165'}
              accessibilityLabel={weightLabel}
              accessibilityHint={hint('weight')}
            />
          )}
        </StatCard>
        <StatCard label="Height" error={error?.field === 'height'}>
          {(focus) =>
            metric ? (
              <CardField
                {...focus}
                flex
                value={draft.heightCm}
                onChangeText={(heightCm) => onChange({ heightCm })}
                suffix="cm"
                keyboardType="decimal-pad"
                placeholder="e.g. 175"
                accessibilityLabel="Height in centimetres"
                accessibilityHint={hint('height')}
              />
            ) : (
              <View style={styles.feetInches}>
                <CardField
                  {...focus}
                  wrap
                  value={draft.feet}
                  onChangeText={(feet) => onChange({ feet })}
                  suffix="ft"
                  keyboardType="number-pad"
                  placeholder="5"
                  accessibilityLabel="Height, feet"
                  accessibilityHint={hint('height')}
                />
                <CardField
                  {...focus}
                  wrap
                  value={draft.inches}
                  onChangeText={(inches) => onChange({ inches })}
                  suffix="in"
                  keyboardType="decimal-pad"
                  placeholder="10"
                  accessibilityLabel="Height, inches"
                  accessibilityHint={hint('height')}
                />
              </View>
            )
          }
        </StatCard>
      </View>

      {error && (
        <View style={styles.error} accessibilityLiveRegion="polite">
          <IconSymbol name="exclamationmark.circle" size={14} color={danger} />
          <Text style={[styles.errorText, { color: danger }]}>{error.message}</Text>
        </View>
      )}

      <View style={styles.activity}>
        <ThemedText type="section">How active are you?</ThemedText>
        <View accessibilityRole="radiogroup" accessibilityLabel="Activity level">
          <ListGroup>
            {ACTIVITY_OPTIONS.map((option) => {
              const selected = draft.activity === option.value;
              return (
                <View key={option.value} style={selected ? { backgroundColor: tintSoft } : null}>
                  <ListRow
                    title={option.label}
                    subtitle={option.description}
                    chevron={false}
                    accessibilityRole="radio"
                    accessibilityLabel={`${option.label}, ${option.description}`}
                    accessibilityState={{ checked: selected, selected }}
                    onPress={() => onChange({ activity: option.value })}
                    trailing={
                      <View style={[styles.radio, selected ? { backgroundColor: tint } : { borderWidth: 2, borderColor: fieldBorder }]}>
                        {selected && <IconSymbol name="checkmark" size={14} color={onTint} />}
                      </View>
                    }
                  />
                </View>
              );
            })}
          </ListGroup>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  step: { gap: 16 },
  copy: { gap: 8 },
  body: { fontSize: 17, lineHeight: 24 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { flexGrow: 1, flexBasis: 150, borderWidth: 2, gap: 6 },
  fieldRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, minHeight: 44 },
  flex: { flex: 1 },
  fieldWrap: { flexGrow: 1, flexBasis: 80 },
  input: { flex: 1, minWidth: 0, fontFamily: Fonts.rounded, fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'], paddingVertical: 8 },
  suffix: { fontSize: 15, fontWeight: '500' },
  feetInches: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorText: { flexShrink: 1, fontSize: 13 },
  activity: { gap: 8 },
  radio: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
