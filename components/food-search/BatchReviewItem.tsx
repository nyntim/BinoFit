import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Stepper } from '@/components/ui/Stepper';
import { Fonts } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { baseGramsOf, itemTotals, itemValidation, type SelectionItem } from '@/lib/food-selection';
import { stepServingAmount, type ServingUnit } from '@/lib/food-validation';

export const BATCH_AMOUNT_ACCESSORY_ID = 'batch-amount-accessory';

type Props = {
  item: SelectionItem;
  onAmount: (raw: string) => void;
  onUnit: (unit: ServingUnit) => void;
  onRemove: () => void;
  onRetry: () => void;
};

/** One review card: name and values, resolution status, amount stepper, unit chips and remove. */
export function BatchReviewItem({ item, onAmount, onUnit, onRemove, onRetry }: Props) {
  const danger = useThemeColor({}, 'danger');
  const icon = useThemeColor({}, 'icon');
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
  const step = (direction: 1 | -1) => {
    const next = stepServingAmount(item.amount, item.unit, direction);
    if (next !== null) onAmount(next);
  };

  return (
    <Card padding="compact" style={styles.card}>
      <View style={styles.top}>
        <View style={styles.titleCol}>
          <ThemedText type="body" style={styles.name} numberOfLines={2}>{food.name}</ThemedText>
          <ThemedText type="caption" style={styles.tabular}>{`P ${totals.protein} · C ${totals.carbs} · F ${totals.fat}`}</ThemedText>
        </View>
        <ThemedText type="stat" style={styles.cal}>{totals.calories}</ThemedText>
        <Pressable
          onPress={onRemove}
          style={styles.remove}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${food.name}`}
        >
          <IconSymbol name="xmark" size={18} color={icon} />
        </Pressable>
      </View>

      {item.status === 'pending' ? (
        <View style={styles.statusRow} accessibilityState={{ busy: true }}>
          <ActivityIndicator size="small" color={tint} />
          <ThemedText type="label" style={{ color: icon }}>Loading details...</ThemedText>
        </View>
      ) : null}
      {item.status === 'failed' ? (
        <View style={styles.statusRow} accessibilityRole="alert">
          <ThemedText type="label" style={{ color: danger }}>{"Couldn't load full details."}</ThemedText>
          <Button label="Try again" variant="ghost" size="sm" accessibilityLabel={`Try again for ${food.name}`} onPress={onRetry} />
        </View>
      ) : null}

      <View style={styles.amountRow}>
        <Stepper
          decrementLabel={`Less ${food.name}`}
          incrementLabel={`More ${food.name}`}
          decrementDisabled={stepServingAmount(item.amount, item.unit, -1) === null}
          onDecrement={() => step(-1)}
          onIncrement={() => step(1)}
        >
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
            style={[styles.input, { color: validation.error ? danger : text }]}
          />
        </Stepper>
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Serving size">
          {units.map(({ unit, label }) => (
            <Chip key={unit} role="radio" label={label} selected={item.unit === unit} onPress={() => onUnit(unit)} />
          ))}
        </View>
      </View>
      {validation.error ? <ThemedText type="label" style={{ color: danger }}>{validation.error}</ThemedText> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  titleCol: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontWeight: '600' },
  tabular: { fontVariant: ['tabular-nums'] },
  cal: { fontSize: 20, lineHeight: 24 },
  remove: { width: 44, height: 44, marginTop: -10, marginRight: -10, alignItems: 'center', justifyContent: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  amountRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  input: { minWidth: 64, paddingVertical: 6, textAlign: 'center', fontFamily: Fonts.rounded, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  chips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6, minWidth: 140 },
});
