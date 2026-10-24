import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { ListGroup, ListRow } from '@/components/ui/ListGroup';
import { SearchField } from '@/components/ui/SearchField';
import { SheetHeader } from '@/components/ui/SheetHeader';
import { TextField } from '@/components/ui/TextField';
import { useThemeColor } from '@/hooks/use-theme-color';
import { searchLiquids } from '@/lib/database';
import { parseFoodDecimal } from '@/lib/food-validation';
import { formatWater, mlToOz, waterPresets } from '@/lib/units';
import type { Food, QuickAddDrink, WeightUnit } from '@/lib/types';

const AMOUNT_ERROR = 'Enter an amount above 0.';

const unitLabel = (unit: WeightUnit) => (unit === 'kg' ? 'ml' : 'oz');
/** Display units (ml or oz) to the stored oz. */
const toOz = (value: number, unit: WeightUnit) => (unit === 'kg' ? mlToOz(value) : value);
/** A positive amount in display units, or null. */
function parseAmount(text: string): number | null {
  const parsed = parseFoodDecimal(text, 'required');
  return parsed.valid && parsed.value !== null && parsed.value > 0 ? parsed.value : null;
}

/** Bottom sheet on the scrim: the grabber header and the body. */
function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const overlay = useThemeColor({}, 'overlay');
  const sheetBackground = useThemeColor({}, 'sheetBackground');
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={[styles.overlay, { backgroundColor: overlay }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: sheetBackground, paddingBottom: 16 + insets.bottom }]}>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** The "Add a drink" sheet: quick amounts, an other amount and a drink name. */
export function CustomWaterModal({
  visible,
  onClose,
  onAdd,
  unit,
  todayTotal,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (amount: number, name: string) => void;
  unit: WeightUnit;
  /** Today's total so far, in oz. */
  todayTotal: number;
}) {
  const presets = waterPresets(unit);
  const cardSecondary = useThemeColor({}, 'cardSecondary');
  const tintSoft = useThemeColor({}, 'tintSoft');
  const tint = useThemeColor({}, 'tint');
  const icon = useThemeColor({}, 'icon');
  const [amount, setAmount] = useState(String(presets[0]));
  const [name, setName] = useState('Water');
  const [error, setError] = useState<string | null>(null);
  const parsed = parseAmount(amount);

  const reset = () => {
    setAmount(String(presets[0]));
    setName('Water');
    setError(null);
  };

  const handleAdd = () => {
    if (parsed === null) {
      setError(AMOUNT_ERROR);
      return;
    }
    onAdd(toOz(parsed, unit), name.trim() || 'Water');
    onClose();
    reset();
  };

  const afterThis = formatWater(todayTotal + (parsed === null ? 0 : toOz(parsed, unit)), unit);

  return (
    <Sheet visible={visible} onClose={onClose}>
      <SheetHeader grabber title="Add a drink" onCancel={onClose} action={{ label: 'Add', onPress: handleAdd }} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.amount}>
          <View style={styles.amountRow}>
            <ThemedText type="hero">{parsed === null ? '0' : String(parsed)}</ThemedText>
            <ThemedText type="title" style={{ color: icon }}>{unitLabel(unit)}</ThemedText>
          </View>
          <ThemedText type="caption">{`Today ${formatWater(todayTotal, unit)}, ${afterThis} after this`}</ThemedText>
        </View>

        <View style={styles.tiles} accessibilityRole="radiogroup" accessibilityLabel="Amount">
          {presets.map((preset) => {
            const selected = parsed === preset;
            return (
              <Pressable
                key={preset}
                onPress={() => { setAmount(String(preset)); setError(null); }}
                accessibilityRole="radio"
                accessibilityLabel={`${preset} ${unitLabel(unit)}`}
                accessibilityState={{ checked: selected, selected }}
                style={[styles.tile, { backgroundColor: selected ? tintSoft : cardSecondary, borderColor: selected ? tint : 'transparent' }]}
              >
                <MaterialIcons name="local-drink" size={22} color={selected ? tint : icon} />
                <ThemedText type="label" style={styles.tileLabel}>{`${preset} ${unitLabel(unit)}`}</ThemedText>
              </Pressable>
            );
          })}
        </View>

        <TextField
          label="Other amount"
          value={amount}
          onChangeText={(value) => { setAmount(value); setError(null); }}
          keyboardType="decimal-pad"
          suffix={unitLabel(unit)}
          error={error}
        />
        <TextField label="Drink name" value={name} onChangeText={setName} placeholder="Water" />
      </ScrollView>
    </Sheet>
  );
}

/** Pick a drink from the liquids in the food database and save it as a quick drink. */
export function QuickAddSearchModal({
  visible,
  onClose,
  onSelect,
  unit,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (drink: QuickAddDrink) => void;
  unit: WeightUnit;
}) {
  const icon = useThemeColor({}, 'icon');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [amount, setAmount] = useState(String(waterPresets(unit)[0]));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && query.length > 1) {
      searchLiquids(query).then(setResults);
    } else if (query.length <= 1) {
      setResults([]);
    }
  }, [query, visible]);

  const handleConfirm = () => {
    if (!selectedFood) return;
    const val = parseAmount(amount);
    if (val === null) {
      setError(AMOUNT_ERROR);
      return;
    }
    const oz = toOz(val, unit);
    onSelect({
      id: Crypto.randomUUID(),
      name: `${formatWater(oz, unit)} ${selectedFood.name}`,
      amount: oz,
      food_id: selectedFood.id,
    });
    setQuery('');
    setResults([]);
    setSelectedFood(null);
    setAmount(String(waterPresets(unit)[0]));
    setError(null);
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <SheetHeader grabber title="Add a quick drink" onCancel={onClose} />
      {selectedFood ? (
        <View style={styles.body}>
          <ListGroup>
            <ListRow title={selectedFood.name} subtitle={selectedFood.brand ?? undefined} trailing={<Button label="Change" variant="ghost" size="sm" onPress={() => setSelectedFood(null)} />} />
          </ListGroup>
          <TextField
            label="Amount"
            value={amount}
            onChangeText={(value) => { setAmount(value); setError(null); }}
            keyboardType="decimal-pad"
            suffix={unitLabel(unit)}
            error={error}
            autoFocus
          />
          <Button label="Confirm" size="lg" onPress={handleConfirm} />
        </View>
      ) : (
        <View style={styles.body}>
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Search drinks, like coffee"
            accessibilityLabel="Search drinks"
            autoFocus
          />
          <ScrollView style={styles.results} keyboardShouldPersistTaps="handled">
            {results.length > 0 && (
              <ListGroup>
                {results.map((food) => (
                  <ListRow key={food.id} title={food.name} subtitle={food.brand ?? undefined} onPress={() => setSelectedFood(food)} />
                ))}
              </ListGroup>
            )}
            {query.length > 1 && results.length === 0 && (
              <ThemedText type="caption" style={[styles.empty, { color: icon }]}>{`No liquids found matching "${query}"`}</ThemedText>
            )}
          </ScrollView>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '90%' },
  body: { gap: 16, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  amount: { alignItems: 'center', gap: 4 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexGrow: 1, flexBasis: 72, minHeight: 84, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 6 },
  tileLabel: { fontWeight: '600' },
  results: { maxHeight: 360 },
  empty: { textAlign: 'center', marginTop: 20 },
});
