import { StyleSheet } from 'react-native';
import { Button } from '@/components/ui/Button';

type Props = {
  onPress: () => void;
  /** `dashed` is "+ Add exercises" with a dashed outline; `plain` is "Add exercises" beside other actions. */
  variant?: 'dashed' | 'plain';
};

export function AddExercisesButton({ onPress, variant = 'dashed' }: Props) {
  return (
    <Button
      variant="secondary"
      size="lg"
      label={variant === 'dashed' ? '+ Add exercises' : 'Add exercises'}
      accessibilityLabel="Add exercises"
      onPress={onPress}
      style={variant === 'dashed' ? styles.dashed : variant === 'plain' ? styles.plain : undefined}
    />
  );
}

const styles = StyleSheet.create({
  dashed: { borderStyle: 'dashed' },
  plain: { flex: 1, alignSelf: 'auto' },
});
