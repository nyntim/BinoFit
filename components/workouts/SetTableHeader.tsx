import { StyleSheet, Text, View } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { SetColumn } from '@/lib/workouts/editor-state';

/** Column widths shared by the header and the rows. */
export function columnStyle(c: SetColumn) {
  return c.width === 'flex' ? { flex: 1, minWidth: 0 } : { width: c.width };
}

export function SetTableHeader({ columns }: { columns: SetColumn[] }) {
  const muted = useThemeColor({}, 'icon');
  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {columns.map((c) => (
        <Text
          key={c.key}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          style={[styles.label, columnStyle(c), { color: muted, textAlign: c.align }]}
        >
          {c.label}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 12, fontWeight: '500', letterSpacing: 0.4, textTransform: 'uppercase' },
});
