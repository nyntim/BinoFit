import { Pressable, StyleSheet, View } from 'react-native';
import { QuickAddButton } from '@/components/dashboard/QuickAddButton';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatWater } from '@/lib/units';
import type { QuickAddDrink, WaterLog, WeightUnit } from '@/lib/types';

const SEGMENTS = 10;
/** The row fills one segment per 8 oz glass: a neutral scale, not a target. */
const GLASS_OZ = 8;

type Props = {
  /** Total drunk, in oz (storage unit). */
  total: number;
  logs: WaterLog[];
  quickAddDrinks: QuickAddDrink[];
  unit: WeightUnit;
  isEditing: boolean;
  onAdd: (amount: number, name: string) => void;
  onOpenDrinkSheet: () => void;
  onDeleteLog: (log: WaterLog) => void;
  onRemoveQuickAdd: (id: string) => void;
  onAddQuickAdd: () => void;
};

/** Water total in the user's unit, with quick drinks and the day's drinks. There is no target. */
export function WaterCard({ total, logs, quickAddDrinks, unit, isEditing, onAdd, onOpenDrinkSheet, onDeleteLog, onRemoveQuickAdd, onAddQuickAdd }: Props) {
  const icon = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const track = useThemeColor({}, 'track');
  const cardSecondary = useThemeColor({}, 'cardSecondary');
  const separator = useThemeColor({}, 'separator');
  const filled = Math.min(SEGMENTS, Math.floor(total / GLASS_OZ));
  const [first, ...others] = quickAddDrinks;
  const chips = isEditing ? quickAddDrinks : others;

  return (
    <Card padding="compact" style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titles}>
          <ThemedText type="title">Water</ThemedText>
          <ThemedText type="caption">{formatWater(total, unit)}</ThemedText>
        </View>
        <View style={styles.actions}>
          {!isEditing && first ? (
            <Button
              label={`+ ${formatWater(first.amount, unit)}`}
              variant="soft"
              size="sm"
              accessibilityLabel={`Add ${first.name}`}
              onPress={() => onAdd(first.amount, first.name)}
            />
          ) : null}
          <Pressable
            onPress={onOpenDrinkSheet}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel="Add a drink"
            style={[styles.plus, { backgroundColor: cardSecondary }]}
          >
            <IconSymbol name="plus" size={20} color={tint} />
          </Pressable>
        </View>
      </View>

      <View
        style={styles.segments}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${filled} of ${SEGMENTS} glasses`}
      >
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <View key={i} style={[styles.segment, { backgroundColor: i < filled ? tint : track }]} />
        ))}
      </View>

      <View style={styles.chips}>
        {chips.map((drink) => (
          <QuickAddButton
            key={drink.id}
            label={drink.name}
            onPress={() => onAdd(drink.amount, drink.name)}
            isEditing={isEditing}
            onRemove={() => onRemoveQuickAdd(drink.id)}
          />
        ))}
        {isEditing && quickAddDrinks.length < 3 && (
          <Chip label="Add quick drink" icon="plus" role="button" surface="card" onPress={onAddQuickAdd} />
        )}
      </View>

      {logs.length > 0 && (
        <View>
          {logs.map((log) => (
            <Pressable
              key={log.id}
              style={[styles.logRow, { borderTopColor: separator }]}
              onLongPress={() => onDeleteLog(log)}
            >
              <ThemedText type="body" numberOfLines={1} style={styles.logName}>{log.drink_name}</ThemedText>
              <ThemedText type="label" style={styles.logAmount}>{formatWater(log.amount, unit)}</ThemedText>
              <Pressable
                onPress={() => onDeleteLog(log)}
                style={styles.delete}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${log.drink_name}`}
              >
                <IconSymbol name="trash" size={18} color={icon} />
              </Pressable>
            </Pressable>
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  titles: { gap: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  plus: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 10, borderRadius: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth },
  logName: { flex: 1 },
  logAmount: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  delete: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
