import type { Colors } from '@/constants/theme';

export type TimePickerSheetProps = {
  visible: boolean;
  value: Date;
  onChange: (d: Date) => void;
  onClose: () => void;
  colors: typeof Colors.light;
  /** 'time' (default) or 'date'. The web fallback only supports time. */
  mode?: 'time' | 'date';
  /** Latest selectable moment (date mode). */
  maximumDate?: Date;
  /** Sheet title; defaults to "Time" or "Date". */
  title?: string;
};
