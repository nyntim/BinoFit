import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Colors } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { ServingUnit } from '@/lib/food-validation';

export function UnitPickerModal({
  visible, servingUnit, baseGrams, foodServingUnits,
  onSelectUnit, onClose, colors,
}: {
  visible: boolean;
  servingUnit: ServingUnit;
  baseGrams: number | null;
  foodServingUnits: string;
  onSelectUnit: (unit: ServingUnit) => void;
  onClose: () => void;
  colors: Pick<typeof Colors.light, 'cardBackground' | 'icon' | 'separator' | 'text' | 'tint'>;
}) {
  const { bottom } = useSafeAreaInsets();

  type UnitOption = { unit: ServingUnit; label: string; sublabel: string };
  const unitOptions: UnitOption[] = [
    { unit: 'default', label: foodServingUnits, sublabel: 'Default serving' },
    ...(baseGrams
      ? [
          { unit: 'grams' as ServingUnit, label: 'Grams', sublabel: 'Weight in g' },
          { unit: 'oz' as ServingUnit, label: 'Ounces', sublabel: 'Weight in oz' },
        ]
      : []),
  ];

  const overlay = useThemeColor({}, 'overlay');
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.modalOverlay, { backgroundColor: overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close serving size" />
        <View style={[styles.pickerSheet, { backgroundColor: colors.cardBackground, paddingBottom: 24 + bottom }]}>
          <Text style={[styles.pickerTitle, { color: colors.text }]}>Serving Size</Text>

          {unitOptions.map(({ unit, label, sublabel }, i) => {
            const isActive = servingUnit === unit;
            const isLast = i === unitOptions.length - 1;
            return (
              <TouchableOpacity
                key={unit}
                style={[
                  styles.unitOption,
                  { borderBottomColor: colors.separator },
                  isLast && styles.unitOptionLast,
                ]}
                onPress={() => onSelectUnit(unit)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <View style={styles.unitOptionText}>
                  <Text style={[styles.unitOptionLabel, { color: colors.text }]}>{label}</Text>
                  <Text style={[styles.unitOptionSub, { color: colors.icon }]}>{sublabel}</Text>
                </View>
                {isActive && (
                  <Text style={[styles.unitOptionCheck, { color: colors.tint }]}>✓</Text>
                )}
              </TouchableOpacity>
            );
          })}

          {baseGrams ? (
            <Text style={[styles.unitNote, { color: colors.icon }]}>
              Per 100 g values show under Nutrition, so they never change what you log.
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Modals
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    padding: 24,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  pickerTitle: { fontSize: 16, fontWeight: '600', textAlign: 'center', marginBottom: 12 },

  // Unit picker
  unitOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  unitOptionLast: { borderBottomWidth: 0 },
  unitOptionText: { flexShrink: 1 },
  unitOptionLabel: { fontSize: 16, fontWeight: '500' },
  unitOptionSub: { fontSize: 12, marginTop: 1 },
  unitOptionCheck: { fontSize: 18, fontWeight: '600' },
  unitNote: { fontSize: 12, lineHeight: 17, marginTop: 14 },
});
