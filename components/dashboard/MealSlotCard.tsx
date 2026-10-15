import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Colors } from '@/constants/theme';
import { FoodLogRow } from '@/components/dashboard/FoodLogRow';
import { slotCalories } from '@/lib/nutrition-totals';
import type { FoodLogWithFood, MealSlot } from '@/lib/types';

type MealSlotCardProps = {
  slot: MealSlot;
  label: string;
  /** Logs for this slot only. */
  logs: FoodLogWithFood[];
  /** True when the slot is shown as Eaten, false when Planned. */
  eaten: boolean;
  showToggle: boolean;
  onToggle: (slot: MealSlot) => void;
  onAdd: (slot: MealSlot) => void;
  onEditLog: (log: FoodLogWithFood) => void;
  onDeleteLog: (log: FoodLogWithFood) => void;
  colors: (typeof Colors)['light'];
};

export function MealSlotCard({
  slot,
  label,
  logs,
  eaten,
  showToggle,
  onToggle,
  onAdd,
  onEditLog,
  onDeleteLog,
  colors,
}: MealSlotCardProps) {
  const slotCals = Math.round(slotCalories(logs, slot));
  const hasLogs = logs.length > 0;

  return (
    <View
      style={[
        styles.slotCard,
        { backgroundColor: colors.cardBackground },
        hasLogs &&
          !eaten && {
            opacity: 0.7,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: colors.icon + '40',
          },
      ]}
    >
      <View style={styles.slotHeader}>
        <View style={styles.slotHeaderLeft}>
          <Text style={[styles.slotLabel, { color: colors.text }]}>{label}</Text>
          {slotCals > 0 && (
            <Text style={[styles.slotCals, { color: colors.icon }]}>{slotCals} cal</Text>
          )}
        </View>

        <View style={styles.slotHeaderRight}>
          {showToggle && (
            <TouchableOpacity
              style={[
                styles.confirmBtn,
                {
                  backgroundColor: eaten ? colors.tint + '18' : colors.icon + '12',
                },
              ]}
              onPress={() => onToggle(slot)}
              activeOpacity={0.7}
              hitSlop={{ top: 7, bottom: 7, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel={`${label}, ${eaten ? 'Eaten' : 'Planned'}`}
              accessibilityHint="Switches between Eaten and Planned"
            >
              <MaterialIcons
                name={eaten ? 'check-circle' : 'radio-button-unchecked'}
                size={18}
                color={eaten ? colors.tint : colors.icon}
              />
              <Text style={[styles.confirmBtnText, { color: eaten ? colors.tint : colors.icon }]}>
                {eaten ? 'Eaten' : 'Planned'}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.tint + '18' }]}
            onPress={() => onAdd(slot)}
            activeOpacity={0.7}
            hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
            accessibilityRole="button"
            accessibilityLabel={`Add food to ${label}`}
          >
            <MaterialIcons name="add" size={20} color={colors.tint} />
          </TouchableOpacity>
        </View>
      </View>

      {hasLogs && (
        <View style={styles.logList}>
          {logs.map((log) => (
            <FoodLogRow
              key={log.id}
              log={log}
              colors={colors}
              onEdit={onEditLog}
              onDelete={onDeleteLog}
            />
          ))}
        </View>
      )}

      {!hasLogs && (
        <TouchableOpacity style={styles.emptySlot} onPress={() => onAdd(slot)} activeOpacity={0.6}>
          <Text style={[styles.emptySlotText, { color: colors.icon }]}>Tap to add food</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  slotCard: { borderRadius: 18, padding: 16, marginBottom: 14 },
  slotHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  slotHeaderLeft: { flex: 1 },
  slotHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  confirmBtnText: { fontSize: 13, fontWeight: '600' },
  slotLabel: { fontSize: 16, fontWeight: '600' },
  slotCals: { fontSize: 13, marginTop: 2 },
  addBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  logList: { marginTop: 12, gap: 2 },
  emptySlot: { marginTop: 10, paddingVertical: 8, alignItems: 'center' },
  emptySlotText: { fontSize: 14 },
});
