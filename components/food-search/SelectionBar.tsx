import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';

type Props = { count: number; onClear: () => void; onReview: () => void };

/** Persistent bar under the food list while selecting: count, Clear and Review. */
export function SelectionBar({ count, onClear, onReview }: Props) {
  const background = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const separator = useThemeColor({}, 'separator');
  const text = useThemeColor({}, 'text');
  const tint = useThemeColor({}, 'tint');
  const disabled = count === 0;
  return (
    <View style={[styles.bar, { backgroundColor: cardBackground, borderTopColor: separator }]}>
      <Text style={[styles.count, { color: text }]} accessibilityLiveRegion="polite">
        {count} selected
      </Text>
      <TouchableOpacity
        onPress={onClear}
        disabled={disabled}
        style={[styles.clear, { opacity: disabled ? 0.4 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel="Clear selection"
        accessibilityState={{ disabled }}
      >
        <Text style={[styles.clearText, { color: tint }]}>Clear</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onReview}
        disabled={disabled}
        style={[styles.review, { backgroundColor: tint, opacity: disabled ? 0.4 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel="Review selected foods"
        accessibilityState={{ disabled }}
      >
        <Text style={[styles.reviewText, { color: background }]}>Review</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  count: { flex: 1, fontSize: 15, fontWeight: '600' },
  clear: { minHeight: 44, minWidth: 44, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center' },
  clearText: { fontSize: 15 },
  review: { minHeight: 44, paddingHorizontal: 22, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  reviewText: { fontSize: 15, fontWeight: '600' },
});
