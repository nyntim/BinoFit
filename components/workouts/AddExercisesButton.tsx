import { Pressable, StyleSheet, Text } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';

export function AddExercisesButton({ onPress }: { onPress: () => void }) {
  const tint = useThemeColor({}, 'tint');
  const fieldBorder = useThemeColor({}, 'fieldBorder');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Add exercises"
      style={[styles.button, { borderColor: fieldBorder }]}
    >
      <Text style={[styles.text, { color: tint }]}>+ Add exercises</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontSize: 15, fontWeight: '600' },
});
