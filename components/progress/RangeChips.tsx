import { SegmentedControl } from '@/components/ui/SegmentedControl';
import type { ProgressRange } from '@/lib/progress';

const RANGES: { value: ProgressRange; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: 'all', label: 'All' },
];

type Props = {
  value: ProgressRange;
  onChange: (range: ProgressRange) => void;
};

export function RangeChips({ value, onChange }: Props) {
  return <SegmentedControl value={value} options={RANGES} onChange={onChange} accessibilityLabel="Range" />;
}
