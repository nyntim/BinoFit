import { StyleSheet, View, Pressable, type GestureResponderEvent } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatServingAmountDisplay } from '@/lib/food-validation';
import type { FoodLogWithFood } from '@/lib/types';

type FoodLogRowProps = {
  log: FoodLogWithFood;
  onEdit?: (log: FoodLogWithFood) => void;
  onDelete?: (log: FoodLogWithFood) => void;
};

/** One logged food on a meal card: name and serving left, calories and remove right. */
export function FoodLogRow({ log, onEdit, onDelete }: FoodLogRowProps) {
  const separator = useThemeColor({}, 'separator');
  const icon = useThemeColor({}, 'icon');
  const edit = (event?: GestureResponderEvent) => { event?.stopPropagation(); onEdit?.(log); };
  const remove = (event?: GestureResponderEvent) => { event?.stopPropagation(); onDelete?.(log); };
  return (
    <View style={[styles.logRow, { borderTopColor: separator }]}>
      <Pressable style={({ pressed }) => [styles.foodAction, pressed && styles.pressed]} onPress={edit}
        onLongPress={onDelete ? remove : undefined}
        accessibilityRole={onEdit ? 'button' : undefined}
        accessibilityLabel={onEdit ? `Edit ${log.food_name}` : undefined}>
        <View style={styles.logInfo}>
          <ThemedText type="body" numberOfLines={1}>{log.food_name}</ThemedText>
          <ThemedText type="caption">
            {formatServingAmountDisplay(log.serving_amount)} × {log.food_serving_units}
          </ThemedText>
        </View>
        <ThemedText type="label" style={styles.logCals}>
          {Math.round(log.food_calories * log.serving_amount)}
        </ThemedText>
      </Pressable>
      {onDelete && (
        <Pressable
          onPress={remove}
          onLongPress={remove}
          style={styles.deleteAction}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${log.food_name}`}
        >
          <IconSymbol name="minus.circle.fill" size={20} color={icon} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingLeft: 18,
    paddingRight: 6,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  foodAction: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteAction: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  logInfo: { flex: 1, minWidth: 0 },
  logCals: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  pressed: { opacity: 0.7 },
});
