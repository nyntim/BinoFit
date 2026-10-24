import { StyleSheet, View } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';

/** Leading check indicator for a selectable food row. The row carries the accessibility state. */
export function SelectionCheck({ selected }: { selected: boolean }) {
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'onTint');
  const fieldBorder = useThemeColor({}, 'fieldBorder');
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.circle, selected ? { backgroundColor: tint, borderColor: tint } : { borderColor: fieldBorder }]}
    >
      {selected ? <IconSymbol name="checkmark" size={16} color={onTint} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
});
