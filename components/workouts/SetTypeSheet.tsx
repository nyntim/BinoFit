import { OptionsSheet } from '@/components/workouts/OptionsSheet';
import type { SetType } from '@/lib/types';
import { SET_TYPE_LABELS } from '@/lib/workouts/editor-state';

const ORDER: SetType[] = ['normal', 'warmup', 'drop', 'failure'];

type Props = {
  visible: boolean;
  current: SetType;
  onSelect: (type: SetType) => void;
  onDelete: () => void;
  onClose: () => void;
};

/** Set type choices plus Delete set. */
export function SetTypeSheet({ visible, current, onSelect, onDelete, onClose }: Props) {
  return (
    <OptionsSheet
      visible={visible}
      title="Set type"
      onClose={onClose}
      options={[
        ...ORDER.map((t) => ({
          key: t,
          label: SET_TYPE_LABELS[t],
          selected: t === current,
          onPress: () => onSelect(t),
        })),
        { key: 'delete', label: 'Delete set', onPress: onDelete },
      ]}
    />
  );
}
