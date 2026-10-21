import { StyleSheet, View, Text, TouchableOpacity, type GestureResponderEvent } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Colors } from '@/constants/theme';
import type { FoodLogWithFood } from '@/lib/types';

type FoodLogRowProps = {
  log: FoodLogWithFood;
  colors: Pick<typeof Colors.light, 'text' | 'icon' | 'separator'>;
  onEdit?: (log: FoodLogWithFood) => void;
  onDelete?: (log: FoodLogWithFood) => void;
};

export function FoodLogRow({ log, colors, onEdit, onDelete }: FoodLogRowProps) {
  const edit = (event?: GestureResponderEvent) => { event?.stopPropagation(); onEdit?.(log); };
  const remove = (event?: GestureResponderEvent) => { event?.stopPropagation(); onDelete?.(log); };
  return (
    <View style={[styles.logRow, { borderTopColor: colors.separator }]}>
      <TouchableOpacity style={styles.foodAction} onPress={edit}
        onLongPress={onDelete ? remove : undefined} activeOpacity={0.7}
        accessibilityRole={onEdit ? 'button' : undefined}
        accessibilityLabel={onEdit ? `Edit ${log.food_name}` : undefined}>
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
        </View>
      </TouchableOpacity>
      {onDelete && (
        <TouchableOpacity
          onPress={remove}
          onLongPress={remove}
          style={styles.deleteAction}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${log.food_name}`}
        >
          <MaterialIcons name="delete-outline" size={18} color={colors.icon} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  foodAction: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center' },
  deleteAction: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  logInfo: { flex: 1, marginRight: 8 },
  logName: { fontSize: 14, fontWeight: '500' },
  logMeta: { fontSize: 12, marginTop: 1 },
  logRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  logCals: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  logCalsUnit: { fontSize: 12, marginRight: 6 },
});
