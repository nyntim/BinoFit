import { Chip } from '@/components/ui/Chip';

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** 'radio' for single-choice rows (regions), 'checkbox' for multi-select (muscles). */
  role?: 'radio' | 'checkbox';
  /** Muscle chips use the regular 34 pt chip; region and brand filters the small one. */
  size?: 'regular' | 'compact';
};

export function ChipToggle({ label, selected, onPress, role = 'checkbox', size = 'regular' }: Props) {
  return <Chip label={label} selected={selected} onPress={onPress} role={role} size={size === 'compact' ? 'sm' : 'md'} />;
}
