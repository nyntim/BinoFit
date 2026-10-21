import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { MacroColors } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { baseGramsOf, itemTotals, itemValidation, type SelectionItem } from '@/lib/food-selection';
import type { ServingUnit } from '@/lib/food-validation';

export const BATCH_AMOUNT_ACCESSORY_ID = 'batch-amount-accessory';

type Props = {
  item: SelectionItem;
  onAmount: (raw: string) => void;
  onUnit: (unit: ServingUnit) => void;
  onRemove: () => void;
  onRetry: () => void;
};

/** One review card: amount, unit chips, values, resolution status and remove. */
export function BatchReviewItem({ item, onAmount, onUnit, onRemove, onRetry }: Props) {
  const cardBackground = useThemeColor({}, 'cardBackground');
  const cardSecondary = useThemeColor({}, 'cardSecondary');
  const danger = useThemeColor({}, 'danger');
  const fieldBorder = useThemeColor({}, 'fieldBorder');
  const icon = useThemeColor({}, 'icon');
  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const tint = useThemeColor({}, 'tint');
  const { food } = item;
  const validation = itemValidation(item);
  const totals = itemTotals(item);
  const weighted = baseGramsOf(food) !== null;
  const units: { unit: ServingUnit; label: string }[] = [
    { unit: 'default', label: `Serving (${food.serving_units})` },
    ...(weighted ? [{ unit: 'grams' as const, label: 'g' }, { unit: 'oz' as const, label: 'oz' }] : []),
  ];
  const sub = food.brand ?? (food.source?.startsWith('usda') ? 'USDA · Generic' : food.source ?? 'Generic');

  return (
    <View style={[styles.card, { backgroundColor: cardBackground }]}>
      <View style={styles.top}>
        <View style={styles.titleCol}>
          <Text style={[styles.name, { color: text }]} numberOfLines={2}>{food.name}</Text>
          <Text style={[styles.sub, { color: icon }]} numberOfLines={1}>{sub}</Text>
        </View>
        <TouchableOpacity
          onPress={onRemove}
          style={styles.remove}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${food.name}`}
        >
          <MaterialIcons name="close" size={20} color={icon} />
        </TouchableOpacity>
      </View>

      {item.status === 'pending' ? (
        <View style={styles.statusRow} accessibilityState={{ busy: true }}>
          <ActivityIndicator size="small" color={tint} />
          <Text style={[styles.statusText, { color: icon }]}>Loading details...</Text>
        </View>
      ) : null}
      {item.status === 'failed' ? (
        <View style={styles.statusRow} accessibilityRole="alert">
          <Text style={[styles.statusText, { color: danger }]}>{"Couldn't load full details."}</Text>
          <TouchableOpacity onPress={onRetry} style={styles.retry} accessibilityRole="button" accessibilityLabel={`Try again for ${food.name}`}>
            <Text style={[styles.retryText, { color: tint }]}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.amountRow}>
        <TextInput
          value={item.amount}
          onChangeText={onAmount}
          keyboardType="decimal-pad"
          inputAccessoryViewID={BATCH_AMOUNT_ACCESSORY_ID}
          selectTextOnFocus
          placeholder="0"
          placeholderTextColor={icon}
          accessibilityLabel={`Amount for ${food.name}`}
          accessibilityHint={validation.error ?? undefined}
          style={[styles.input, { color: tint, borderColor: validation.error ? danger : fieldBorder }]}
        />
        <View style={styles.chips}>
          {units.map(({ unit, label }) => {
            const active = item.unit === unit;
            return (
              <TouchableOpacity
                key={unit}
                onPress={() => onUnit(unit)}
                style={[styles.chip, { backgroundColor: active ? tint : cardSecondary }]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={label}
              >
                <Text style={[styles.chipText, { color: active ? background : text }]} numberOfLines={1}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      {validation.error ? <Text style={[styles.error, { color: danger }]}>{validation.error}</Text> : null}

      <View style={styles.values}>
        <Text style={[styles.cal, { color: text }]}>{totals.calories} cal</Text>
        <Text style={[styles.macro, { color: MacroColors.protein }]}>P {totals.protein}g</Text>
        <Text style={[styles.macro, { color: MacroColors.carbs }]}>C {totals.carbs}g</Text>
        <Text style={[styles.macro, { color: MacroColors.fat }]}>F {totals.fat}g</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 14, gap: 10 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  titleCol: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 13, marginTop: 2 },
  remove: { width: 44, height: 44, marginTop: -8, marginRight: -8, alignItems: 'center', justifyContent: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: { fontSize: 13 },
  retry: { minHeight: 44, justifyContent: 'center' },
  retryText: { fontSize: 13, fontWeight: '600' },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { minWidth: 72, minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'], textAlign: 'center' },
  chips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, justifyContent: 'center', maxWidth: '100%' },
  chipText: { fontSize: 13, fontWeight: '500' },
  error: { fontSize: 12 },
  values: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  cal: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  macro: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
