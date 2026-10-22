import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Colors } from '@/constants/theme';

export function FormRow({
  label, value, onPress, accessibilityLabel, divider, chevron, colors,
}: {
  label: string;
  value: string;
  onPress: () => void;
  accessibilityLabel: string;
  divider?: boolean;
  chevron?: boolean;
  colors: Pick<typeof Colors.light, 'icon' | 'separator' | 'text' | 'tint'>;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[formRowStyles.formRow, divider && [formRowStyles.formRowDivider, { borderBottomColor: colors.separator }]]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={[formRowStyles.formRowLabel, { color: colors.text }]}>{label}</Text>
      <View style={formRowStyles.formRowValue}>
        <Text style={[formRowStyles.formRowValueText, { color: colors.tint }]}>{value}</Text>
        {chevron && <Text style={{ fontSize: 13, color: colors.icon }}>▾</Text>}
      </View>
    </TouchableOpacity>
  );
}

// The screen's Amount row uses the same row styles.
export const formRowStyles = StyleSheet.create({
  formRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  formRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth },
  formRowLabel: { fontSize: 15, fontWeight: '500' },
  formRowValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  formRowValueText: { fontSize: 17, fontWeight: '600', textAlign: 'right' },
});
