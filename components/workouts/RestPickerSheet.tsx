import { OptionsSheet } from '@/components/workouts/OptionsSheet';
import { restChoiceLabel } from '@/lib/workouts/rest-timer';

/** Rest choices in seconds; 0 is "No rest". */
export const REST_PRESETS = [0, 30, 60, 90, 120, 150, 180, 300];

type Props = {
  visible: boolean;
  /** The exercise's current rest in seconds (null when unset). */
  current: number | null | undefined;
  onSelect: (seconds: number) => void;
  onClose: () => void;
};

/** The "Rest time" choices for one exercise. Changing it does not touch a rest that is already running. */
export function RestPickerSheet({ visible, current, onSelect, onClose }: Props) {
  return (
    <OptionsSheet
      visible={visible}
      title="Rest time"
      onClose={onClose}
      options={REST_PRESETS.map((sec) => ({
        key: String(sec),
        label: restChoiceLabel(sec),
        selected: current === sec,
        onPress: () => onSelect(sec),
      }))}
    />
  );
}
