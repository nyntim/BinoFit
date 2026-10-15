import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Colors } from '@/constants/theme';
import type { FoodLogWithFood } from '@/lib/types';

type FoodLogRowProps = {
  log: FoodLogWithFood;
  colors: (typeof Colors)['light'];
  onEdit?: (log: FoodLogWithFood) => void;
  onDelete?: (log: FoodLogWithFood) => void;
};

export function FoodLogRow({ log, colors, onEdit, onDelete }: FoodLogRowProps) {
  return (
    <TouchableOpacity
      style={[styles.logRow, { borderTopColor: colors.separator }]}
      onPress={onEdit ? () => onEdit(log) : undefined}
      onLongPress={onDelete ? () => onDelete(log) : undefined}
      activeOpacity={0.7}
    >
      <View style={styles.logInfo}>
        <Text style={[styles.logName, { color: colors.text }]} numberOfLines={1}>
          {log.food_name}
        </Text>
        <Text style={[styles.logMeta, { color: colors.icon }]}>
          {log.serving_amount} × {log.food_serving_units}
        </Text>
      </View>
      <View style={styles.logRight}>
        <Text style={[styles.logCals, { color: colors.text }]}>
          {Math.round(log.food_calories * log.serving_amount)}
        </Text>
        <Text style={[styles.logCalsUnit, { color: colors.icon }]}>cal</Text>
        {onDelete && (
          <TouchableOpacity
            onPress={() => onDelete(log)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons name="delete-outline" size={18} color={colors.icon} />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  logInfo: { flex: 1, marginRight: 8 },
  logName: { fontSize: 14, fontWeight: '500' },
  logMeta: { fontSize: 12, marginTop: 1 },
  logRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  logCals: { fontSize: 14, fontWeight: '600' },
  logCalsUnit: { fontSize: 12, marginRight: 6 },
});
