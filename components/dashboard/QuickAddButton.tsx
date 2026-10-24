import { Pressable, StyleSheet, View } from 'react-native';
import { Chip } from '@/components/ui/Chip';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';

/** A quick drink chip. While editing it stops logging and shows a remove badge instead. */
export function QuickAddButton({
  label,
  onPress,
  isEditing,
  onRemove,
}: {
  label: string;
  onPress: () => void;
  isEditing?: boolean;
  onRemove?: () => void;
}) {
  const danger = useThemeColor({}, 'danger');
  const onTint = useThemeColor({}, 'onTint');
  return (
    <View style={styles.wrapper}>
      <Chip label={label} role="button" surface="card" onPress={isEditing ? undefined : onPress} />
      {isEditing && (
        <Pressable
          style={[styles.remove, { backgroundColor: danger }]}
          onPress={onRemove}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
        >
          <IconSymbol name="xmark" size={12} color={onTint} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative', alignSelf: 'flex-start' },
  remove: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
