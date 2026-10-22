import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Colors } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';

export function QuickAddButton({
  label,
  onPress,
  colors,
  isEditing,
  onRemove,
}: {
  label: string;
  onPress: () => void;
  colors: Pick<typeof Colors.light, 'cardSecondary' | 'separator' | 'text'>;
  isEditing?: boolean;
  onRemove?: () => void;
}) {
  const danger = useThemeColor({}, 'danger');
  return (
    <View style={styles.quickAddBtnWrapper}>
      <TouchableOpacity
        style={[
          styles.quickAddBtn,
          { backgroundColor: colors.cardSecondary, borderColor: colors.separator },
        ]}
        onPress={isEditing ? undefined : onPress}
        activeOpacity={isEditing ? 1 : 0.7}
      >
        <Text style={[styles.quickAddBtnText, { color: colors.text }]} numberOfLines={1}>
          {label}
        </Text>
      </TouchableOpacity>
      {isEditing && (
        <TouchableOpacity
          style={[styles.removeQuickAddBtn, { backgroundColor: danger }]}
          onPress={onRemove}
        >
          <MaterialIcons name="close" size={12} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  quickAddBtn: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAddBtnText: { fontSize: 13, fontWeight: '500' },
  quickAddBtnWrapper: {
    flex: 1,
    position: 'relative',
  },
  removeQuickAddBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
  },
});
