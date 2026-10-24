import { ActivityIndicator, StyleSheet } from 'react-native';
import { ProgressCardHeader } from '@/components/progress/ProgressCardHeader';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
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
  const icon = useThemeColor({}, 'icon');
  const { status, estimate, reload } = useExpenditure();

  if (status === 'loading') {
    return (
      <Card style={styles.card}>
        <ProgressCardHeader label="Estimated expenditure" />
        <ActivityIndicator color={icon} style={styles.loading} />
      </Card>
    );
  }

  if (status === 'error') {
    return (
      <Card style={styles.card}>
        <ProgressCardHeader label="Estimated expenditure" />
        <ThemedText type="body">Couldn&apos;t load expenditure.</ThemedText>
        <Button variant="ghost" size="sm" label="Retry" onPress={reload} />
      </Card>
    );
  }

  if (estimate === null) {
    return (
      <Card style={styles.card}>
        <ProgressCardHeader
          label="Estimated expenditure"
          value={
            <ThemedText type="stat" style={{ color: icon }}>
              Not enough data yet
            </ThemedText>
          }
          caption="14 logged days and 4 weigh-ins in the last 21 days."
        />
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <ProgressCardHeader
        label="Estimated expenditure"
        value={<ThemedText type="stat">{formatExpenditure(estimate.kcal)}</ThemedText>}
        valueAccessibilityLabel={figureAccessibilityLabel(estimate.kcal)}
        caption="Eaten calories and the weight trend over the last 21 days. Days you didn't log are left out, so missed days pull this down."
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  loading: { paddingVertical: 8 },
});
