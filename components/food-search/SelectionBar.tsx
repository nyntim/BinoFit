import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useShadow } from '@/hooks/useShadow';

type Props = {
  count: number;
  /** Totals of the selection, shown under the count. */
  totals: { calories: number; protein: number; carbs: number; fat: number };
  onReview: () => void;
  /** Reports the bar's height so the list can pad past it. */
  onLayout?: (event: LayoutChangeEvent) => void;
};

/** Floating ink bar over the food list while selecting: count, totals and Review. Clear lives in the header. */
export function SelectionBar({ count, totals, onReview, onLayout }: Props) {
  const background = useThemeColor({}, 'background');
  const ink = useThemeColor({}, 'text');
  const shadow = useShadow('floating');
  const disabled = count === 0;
  return (
    <View onLayout={onLayout} style={[styles.bar, { backgroundColor: ink, boxShadow: shadow }]}>
      <View style={styles.copy}>
        <Text style={[styles.count, { color: background }]} accessibilityLiveRegion="polite">
          {count} {count === 1 ? 'food' : 'foods'}
        </Text>
        <Text style={[styles.totals, { color: background }]}>
          {`${Math.round(totals.calories)} cal · P ${Math.round(totals.protein)} · C ${Math.round(totals.carbs)} · F ${Math.round(totals.fat)}`}
        </Text>
      </View>
      <Pressable
        onPress={onReview}
        disabled={disabled}
        style={[styles.review, { backgroundColor: background, opacity: disabled ? 0.4 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel="Review selected foods"
        accessibilityState={{ disabled }}
      >
        <Text style={[styles.reviewText, { color: ink }]}>Review</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 16, right: 16, bottom: 16, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, borderRadius: 20, paddingVertical: 12, paddingLeft: 18, paddingRight: 12 },
  copy: { flex: 1, minWidth: 120 },
  count: { fontSize: 15, fontWeight: '600' },
  totals: { fontSize: 12, opacity: 0.75, fontVariant: ['tabular-nums'] },
  review: { minHeight: 44, paddingHorizontal: 20, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  reviewText: { fontSize: 15, fontWeight: '600' },
});
