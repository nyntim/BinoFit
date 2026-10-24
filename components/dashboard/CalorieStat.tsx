import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';

type Props = {
  label: string;
  value: number;
  /** `large` is the Left / Over figure; `small` is Goal and Planned. */
  size?: 'large' | 'small';
};

/** Caption over value, read as one group: "Left, 1,150 calories". */
export function CalorieStat({ label, value, size = 'small' }: Props) {
  return (
    <View accessible accessibilityLabel={`${label}, ${value.toLocaleString()} calories`}>
      <ThemedText type="caption">{label}</ThemedText>
      {size === 'large' ? (
        <ThemedText type="stat" style={styles.large}>{value.toLocaleString()}</ThemedText>
      ) : (
        <ThemedText type="body" style={styles.small}>{value.toLocaleString()}</ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  large: { fontSize: 26, lineHeight: 30 },
  small: { fontWeight: '600', fontVariant: ['tabular-nums'] },
});
