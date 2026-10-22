import { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Colors } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { searchLiquids } from '@/lib/database';
import type { Food, QuickAddDrink } from '@/lib/types';

export function CustomWaterModal({
  visible,
  onClose,
  onAdd,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (amount: number, name: string) => void;
  colors: Pick<typeof Colors.light, 'background' | 'cardBackground' | 'cardSecondary' | 'icon' | 'text' | 'tint'>;
}) {
  const overlay = useThemeColor({}, 'overlay');
  const [amount, setAmount] = useState('8');
  const [name, setName] = useState('Water');

  const handleAdd = () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount in oz.');
      return;
    }
    onAdd(val, name || 'Water');
    onClose();
    setAmount('8');
    setName('Water');
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={[styles.modalOverlay, { backgroundColor: overlay }]}>
        <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Add Custom Drink</Text>
          
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.icon }]}>Drink Name</Text>
            <TextInput
              style={[styles.input, { color: colors.text, backgroundColor: colors.cardBackground }]}
              value={name}
              onChangeText={setName}
              placeholder="Water, Coffee, etc."
              placeholderTextColor={colors.icon}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.icon }]}>Amount (oz)</Text>
            <TextInput
              style={[styles.input, { color: colors.text, backgroundColor: colors.cardBackground }]}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="8"
              placeholderTextColor={colors.icon}
            />
          </View>

          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: colors.cardSecondary }]}
              onPress={onClose}
            >
              <Text style={[styles.modalBtnText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: colors.tint }]}
              onPress={handleAdd}
            >
              <Text
                style={[
                  styles.modalBtnText,
                  { color: colors.background, fontWeight: '700' },
                ]}
              >
                Add
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function QuickAddSearchModal({
  visible,
  onClose,
  onSelect,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (drink: QuickAddDrink) => void;
  colors: Pick<typeof Colors.light, 'background' | 'cardBackground' | 'icon' | 'separator' | 'text' | 'tint'>;
}) {
  const overlay = useThemeColor({}, 'overlay');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [amount, setAmount] = useState('8');

  useEffect(() => {
    if (visible && query.length > 1) {
      searchLiquids(query).then(setResults);
    } else if (query.length <= 1) {
      setResults([]);
    }
  }, [query, visible]);

  const handleSelect = (food: Food) => {
    setSelectedFood(food);
  };

  const handleConfirm = () => {
    if (!selectedFood) return;
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }
    onSelect({
      id: Crypto.randomUUID(),
      name: `${val} oz ${selectedFood.name}`,
      amount: val,
      food_id: selectedFood.id,
    });
    setQuery('');
    setResults([]);
    setSelectedFood(null);
    setAmount('8');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={[styles.modalOverlay, { backgroundColor: overlay }]}>
        <View style={[styles.modalContent, { backgroundColor: colors.background, height: '80%' }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Add Quick-Add Drink</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close quick-add drinks" style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <MaterialIcons name="close" size={24} color={colors.icon} />
            </TouchableOpacity>
          </View>

          {selectedFood ? (
            <View style={{ gap: 20 }}>
              <View>
                <Text style={[styles.inputLabel, { color: colors.icon }]}>Selected Drink</Text>
                <Text style={[styles.selectedFoodName, { color: colors.text }]}>{selectedFood.name}</Text>
                <TouchableOpacity onPress={() => setSelectedFood(null)}>
                  <Text style={{ color: colors.tint, marginTop: 4 }}>Change</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.icon }]}>Quick-Add Amount (oz)</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, backgroundColor: colors.cardBackground }]}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  placeholder="8"
                  autoFocus
                />
              </View>

              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.tint }]}
                onPress={handleConfirm}
              >
                <Text style={[styles.modalBtnText, { color: colors.background, fontWeight: '700' }]}>
                  Confirm
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TextInput
                style={[styles.input, { color: colors.text, backgroundColor: colors.cardBackground }]}
                value={query}
                onChangeText={setQuery}
                placeholder="Search for water, coffee, soda..."
                placeholderTextColor={colors.icon}
                autoFocus
              />

              <ScrollView style={{ flex: 1, marginTop: 12 }}>
                {results.map((food) => (
                  <TouchableOpacity
                    key={food.id}
                    style={[styles.searchResultItem, { borderBottomColor: colors.separator }]}
                    onPress={() => handleSelect(food)}
                  >
                    <Text style={[styles.resultName, { color: colors.text }]}>{food.name}</Text>
                    {food.brand && <Text style={[styles.resultBrand, { color: colors.icon }]}>{food.brand}</Text>}
                  </TouchableOpacity>
                ))}
                {query.length > 1 && results.length === 0 && (
                  <Text style={{ textAlign: 'center', color: colors.icon, marginTop: 20 }}>No liquids found matching &quot;{query}&quot;</Text>
                )}
              </ScrollView>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: { width: '100%', borderRadius: 20, padding: 24, gap: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  inputGroup: { gap: 8 },
  inputLabel: { fontSize: 14, fontWeight: '500' },
  input: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  selectedFoodName: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 4,
  },
  searchResultItem: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultName: {
    fontSize: 16,
    fontWeight: '500',
  },
  resultBrand: {
    fontSize: 12,
    marginTop: 2,
  },
  modalBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnText: { fontSize: 16, fontWeight: '600' },
});
