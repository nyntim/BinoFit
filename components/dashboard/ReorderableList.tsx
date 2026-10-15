import { useEffect, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { moveItem } from '@/lib/meals';

/** Assigns on the UI thread; a helper so the shared value is not mutated through a prop. */
function assignPositions(sv: SharedValue<Record<string, number>>, next: Record<string, number>) {
  'worklet';
  sv.value = next;
}

type Item = { id: string; label: string };

type Props<T extends Item> = {
  items: T[];
  /** Every row has this fixed height. */
  itemHeight: number;
  gap: number;
  iconColor: string;
  /** Called with the new id order after a drag or an accessibility move. */
  onReorder: (orderedIds: string[]) => void;
  /** Called when a handle is touched / released so the parent can lock its ScrollView. */
  onDragActiveChange?: (active: boolean) => void;
  renderItem: (item: T, handle: ReactNode) => ReactNode;
};

/**
 * Vertical drag-to-reorder for fixed-height rows. Rows are absolutely positioned; a Pan
 * gesture on each row's handle moves it and the other rows slide to make room. No scrolling
 * inside: it relies on the parent ScrollView, which the parent locks via onDragActiveChange.
 */
export function ReorderableList<T extends Item>({
  items,
  itemHeight,
  gap,
  iconColor,
  onReorder,
  onDragActiveChange,
  renderItem,
}: Props<T>) {
  const slot = itemHeight + gap;
  // id -> slot index. Equal to list order except while dragging.
  const positions = useSharedValue<Record<string, number>>({});

  useEffect(() => {
    const next: Record<string, number> = {};
    items.forEach((it, i) => {
      next[it.id] = i;
    });
    positions.value = next;
  }, [items, positions]);

  const ids = items.map((i) => i.id);

  return (
    <View style={{ height: Math.max(0, items.length * slot - gap) }}>
      {items.map((item, index) => (
        <Row
          key={item.id}
          id={item.id}
          label={item.label}
          index={index}
          count={items.length}
          slot={slot}
          itemHeight={itemHeight}
          positions={positions}
          iconColor={iconColor}
          onCommit={onReorder}
          onMoveBy={(delta) => onReorder(moveItem(ids, index, index + delta))}
          onDragActiveChange={onDragActiveChange}
        >
          {(handle) => renderItem(item, handle)}
        </Row>
      ))}
    </View>
  );
}

type RowProps = {
  id: string;
  label: string;
  index: number;
  count: number;
  slot: number;
  itemHeight: number;
  positions: SharedValue<Record<string, number>>;
  iconColor: string;
  onCommit: (orderedIds: string[]) => void;
  onMoveBy: (delta: number) => void;
  onDragActiveChange?: (active: boolean) => void;
  children: (handle: ReactNode) => ReactNode;
};

function Row({
  id,
  label,
  index,
  count,
  slot,
  itemHeight,
  positions,
  iconColor,
  onCommit,
  onMoveBy,
  onDragActiveChange,
  children,
}: RowProps) {
  const dragging = useSharedValue(false);
  const dragY = useSharedValue(0);
  const startY = useSharedValue(0);

  const setLock = (active: boolean) => onDragActiveChange?.(active);

  const pan = Gesture.Pan()
    .minDistance(1)
    // Lock the parent scroll as soon as the handle is touched, before the pan activates.
    .onTouchesDown(() => {
      runOnJS(setLock)(true);
    })
    .onStart(() => {
      const from = positions.value[id] ?? index;
      startY.value = from * slot;
      dragY.value = from * slot;
      dragging.value = true;
    })
    .onUpdate((e) => {
      const maxY = (count - 1) * slot;
      const y = Math.min(maxY, Math.max(0, startY.value + e.translationY));
      dragY.value = y;
      const to = Math.min(count - 1, Math.max(0, Math.round(y / slot)));
      const current = positions.value;
      const from = current[id];
      if (from === undefined || from === to) return;
      const next: Record<string, number> = {};
      for (const key of Object.keys(current)) {
        const p = current[key];
        if (key === id) next[key] = to;
        else if (from < to && p > from && p <= to) next[key] = p - 1;
        else if (from > to && p >= to && p < from) next[key] = p + 1;
        else next[key] = p;
      }
      assignPositions(positions, next);
    })
    .onFinalize((_, success) => {
      dragging.value = false;
      if (success) {
        const final = positions.value;
        const ordered = Object.keys(final).sort((a, b) => final[a] - final[b]);
        runOnJS(onCommit)(ordered);
      }
      runOnJS(setLock)(false);
    });

  const animatedStyle = useAnimatedStyle(() => {
    const target = (positions.value[id] ?? index) * slot;
    return {
      top: dragging.value ? dragY.value : withTiming(target, { duration: 150 }),
      zIndex: dragging.value ? 10 : 0,
      opacity: dragging.value ? 0.92 : 1,
    };
  });

  const handle = (
    <GestureDetector gesture={pan}>
      <View
        style={styles.handle}
        accessible
        accessibilityRole="button"
        accessibilityLabel={`Reorder ${label}`}
        accessibilityHint="Use the actions rotor to move up or down"
        accessibilityValue={{ text: `Position ${index + 1} of ${count}` }}
        accessibilityActions={[
          { name: 'moveUp', label: 'Move up' },
          { name: 'moveDown', label: 'Move down' },
        ]}
        onAccessibilityAction={(e) => {
          const name = e.nativeEvent.actionName;
          const delta = name === 'moveDown' ? 1 : name === 'moveUp' ? -1 : 0;
          const to = index + delta;
          if (delta === 0 || to < 0 || to >= count) return;
          onMoveBy(delta);
          AccessibilityInfo.announceForAccessibility(`${label.trim() || 'Meal'} moved to position ${to + 1} of ${count}`);
        }}
      >
        <MaterialIcons name="drag-handle" size={24} color={iconColor} />
      </View>
    </GestureDetector>
  );

  return (
    <Animated.View style={[styles.row, { height: itemHeight }, animatedStyle]}>
      {children(handle)}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { position: 'absolute', left: 0, right: 0 },
  handle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
