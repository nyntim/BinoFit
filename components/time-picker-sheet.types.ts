import type { Colors } from '@/constants/theme';

export type TimePickerSheetProps = {
  visible: boolean;
  value: Date;
  onChange: (d: Date) => void;
  onClose: () => void;
  colors: typeof Colors.light;
};
