import { SegmentedControl } from '@/components/ui/SegmentedControl';

type Props<T extends string> = {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  accessibilityLabel: string;
};

/** Segmented radio group used by Units, the effort scale and the new-food status. Kept as a thin wrapper over `SegmentedControl`. */
export function PillSwitch<T extends string>({ value, options, onChange, accessibilityLabel }: Props<T>) {
  return <SegmentedControl value={value} options={options} onChange={onChange} accessibilityLabel={accessibilityLabel} />;
}
