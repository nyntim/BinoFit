import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useExpenditure } from '@/hooks/useExpenditure';
import { formatExpenditure } from '@/lib/expenditure';

function figureAccessibilityLabel(kcal: number): string {
  const rounded = Math.round(kcal);
  const abs = Math.abs(rounded).toLocaleString('en-US');
  return rounded < 0
    ? `minus ${abs} kilocalories per day`
    : `${abs} kilocalories per day`;
}

/** Estimated daily expenditure over the last 21 days ending yesterday. */
export function ExpenditureCard() {
  const card = useThemeColor({}, 'cardBackground');
  const text = useThemeColor({}, 'text');
  const icon = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const { status, estimate, reload } = useExpenditure();

  return (
    <View style={[styles.card, { backgroundColor: card }]}>
      <Text style={[styles.title, { color: text }]} accessibilityRole="header">
        Estimated expenditure
      </Text>

      {status === 'loading' && <ActivityIndicator color={icon} style={styles.loading} />}

      {status === 'error' && (
        <View style={styles.message}>
          <Text style={[styles.body, { color: text }]}>Couldn&apos;t load expenditure.</Text>
          <TouchableOpacity
            style={styles.textButton}
            onPress={reload}
            accessibilityRole="button"
            accessibilityLabel="Retry"
          >
            <Text style={[styles.textButtonLabel, { color: tint }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {status === 'ready' && estimate === null && (
        <View style={styles.block}>
          <Text style={[styles.insufficient, { color: icon }]}>Not enough data yet</Text>
          <Text style={[styles.caption, { color: icon }]}>
            14 logged days and 4 weigh-ins in the last 21 days.
          </Text>
        </View>
      )}

      {status === 'ready' && estimate !== null && (
        <View style={styles.block}>
          <Text
            style={[styles.figure, { color: text }]}
            accessibilityLabel={figureAccessibilityLabel(estimate.kcal)}
          >
            {formatExpenditure(estimate.kcal)}
          </Text>
          <Text style={[styles.caption, { color: icon }]}>
            Eaten calories and the weight trend over the last 21 days. Days you didn&apos;t log are
            left out, so missed days pull this down.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: 20, gap: 16 },
  title: { fontSize: 17, fontWeight: '600', lineHeight: 22 },
  loading: { paddingVertical: 8 },
  block: { gap: 4 },
  figure: { fontSize: 22, fontWeight: '700', lineHeight: 26, fontVariant: ['tabular-nums'] },
  insufficient: { fontSize: 13, fontWeight: '500' },
  caption: { fontSize: 12, lineHeight: 17 },
  message: { gap: 4 },
  body: { fontSize: 15 },
  textButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  textButtonLabel: { fontSize: 15, fontWeight: '600' },
});
