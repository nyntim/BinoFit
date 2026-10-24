import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/Card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';

type Props = { steps: number; activeCalories: number };

/** HealthKit steps and active calories for today. Icons use theme ink, not macro colors. */
export function ActivityCard({ steps, activeCalories }: Props) {
  const tint = useThemeColor({}, 'tint');
  const icon = useThemeColor({}, 'icon');
  const separator = useThemeColor({}, 'separator');
  return (
    <Card padding="compact">
      <View style={styles.row}>
        <View style={styles.item}>
          <IconSymbol name="figure.walk" size={20} color={tint} />
          <ThemedText type="label" style={styles.text}>{steps.toLocaleString()} steps</ThemedText>
        </View>
        <View style={[styles.divider, { backgroundColor: separator }]} />
        <View style={styles.item}>
          <IconSymbol name="flame.fill" size={20} color={icon} />
          <ThemedText type="label" style={styles.text}>{Math.round(activeCalories)} cal</ThemedText>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 16 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  text: { fontWeight: '600' },
  divider: { width: 1, height: 20 },
});
