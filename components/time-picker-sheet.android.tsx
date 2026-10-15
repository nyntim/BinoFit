import DateTimePicker from '@react-native-community/datetimepicker';
import type { TimePickerSheetProps } from '@/components/time-picker-sheet.types';

// Android shows the system time dialog; it closes itself on set or dismiss
export function TimePickerSheet({ visible, value, onChange, onClose }: TimePickerSheetProps) {
  if (!visible) return null;
  return (
    <DateTimePicker
      value={value}
      mode="time"
      onChange={(event, d) => {
        onClose();
        if (event.type === 'set' && d) onChange(d);
      }}
    />
  );
}
