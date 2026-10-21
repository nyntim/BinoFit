import { StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useThemeColor } from '@/hooks/use-theme-color';

/** Leading check indicator for a selectable food row. The row carries the accessibility state. */
export function SelectionCheck({ selected }: { selected: boolean }) {
  const tint = useThemeColor({}, 'tint');
  const separator = useThemeColor({}, 'separator');
  const background = useThemeColor({}, 'background');
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.circle, selected ? { backgroundColor: tint, borderColor: tint } : { borderColor: separator }]}
    >
      {selected ? <MaterialIcons name="check" size={16} color={background} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
});
