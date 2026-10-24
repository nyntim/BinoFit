import { Alert, Platform } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { format } from 'date-fns';
import { WeightEntrySheet } from '@/components/progress/WeightEntrySheet';
import { syncToSupabase } from '@/lib/sync';
import { deleteWeightEntriesForDate, saveWeightEntry, weightRangeMessage } from '@/lib/weight';
import { formatShortDate } from '@/lib/workouts/format';
import type { WeightEntry } from '@/lib/types';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('@/components/ui/icon-symbol', () => ({ IconSymbol: () => null }));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: () => null }));
jest.mock('@/hooks/usePreferences', () => ({ usePreferences: () => ({ weightUnit: 'lb', appearance: 'light' }) }));
jest.mock('@/lib/sync', () => ({ syncToSupabase: jest.fn() }));
jest.mock('@/lib/weight', () => ({
  ...jest.requireActual('@/lib/weight'),
  saveWeightEntry: jest.fn(),
  deleteWeightEntriesForDate: jest.fn(),
}));

const NOTICE = 'Apple Health readings import on their own. A weight you log here wins for that day.';
const entry: WeightEntry = {
  id: 'w1',
  date: '2026-10-14',
  weight_kg: 78.2,
  measured_at: '2026-10-14T08:30:00',
  source: 'manual',
  created_at: '2026-10-14T08:30:00',
  updated_at: '2026-10-14T08:30:00',
};

const props = { visible: true, onClose: jest.fn(), onChanged: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('log mode', () => {
  it('shows the Log weight title and none of the unbuilt controls', async () => {
    await render(<WeightEntrySheet {...props} entry={null} />);
    expect(screen.getByRole('header', { name: 'Log weight' })).toBeTruthy();
    expect(screen.queryByLabelText(/Increase by 0\.1/)).toBeNull();
    expect(screen.queryByText(/Last entry/)).toBeNull();
    expect(screen.queryByText('Delete entry')).toBeNull();
  });

  it('disables Save with empty input', async () => {
    await render(<WeightEntrySheet {...props} entry={null} />);
    expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(saveWeightEntry).not.toHaveBeenCalled();
  });

  it('saves in kg, then syncs', async () => {
    await render(<WeightEntrySheet {...props} entry={null} />);
    await fireEvent.changeText(screen.getByLabelText('Weight in lb'), '172.4');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(syncToSupabase).toHaveBeenCalledTimes(1));
    expect(saveWeightEntry).toHaveBeenCalledTimes(1);
    const arg = (saveWeightEntry as jest.Mock).mock.calls[0][0];
    expect(arg.date).toBe(format(new Date(), 'yyyy-MM-dd'));
    expect(arg.weight_kg).toBeCloseTo(78.2, 1);
    expect(props.onChanged).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it('explains an out of range value', async () => {
    await render(<WeightEntrySheet {...props} entry={null} />);
    await fireEvent.changeText(screen.getByLabelText('Weight in lb'), '5');
    expect(screen.getByText(weightRangeMessage('lb'))).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState.disabled).toBe(true);
  });

  it('shows the Health notice on iOS only', async () => {
    const spy = jest.replaceProperty(Platform, 'OS', 'ios');
    const { unmount } = await render(<WeightEntrySheet {...props} entry={null} />);
    expect(screen.getByText(NOTICE)).toBeTruthy();
    await unmount();
    spy.replaceValue('android');
    await render(<WeightEntrySheet {...props} entry={null} />);
    expect(screen.queryByText(NOTICE)).toBeNull();
    expect(screen.getByRole('button', { name: 'Date, Today' })).toBeTruthy();
    spy.restore();
  });
});

describe('edit mode', () => {
  it('titles with the date and shows the logged time', async () => {
    await render(<WeightEntrySheet {...props} entry={entry} />);
    expect(screen.getByRole('header', { name: formatShortDate(entry.date) })).toBeTruthy();
    expect(screen.getByText(/^lb · logged at \d{1,2}:\d{2} (AM|PM)$/)).toBeTruthy();
    expect(screen.queryByText('Date')).toBeNull();
    expect(screen.queryByText(NOTICE)).toBeNull();
    expect(screen.getByText('Your profile weight follows the latest entry.')).toBeTruthy();
  });

  it('confirms before deleting, then deletes and syncs', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<WeightEntrySheet {...props} entry={entry} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Delete entry' }));
    expect(alert).toHaveBeenCalledWith('Delete this entry?', undefined, expect.any(Array));
    expect(deleteWeightEntriesForDate).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] as { text: string; style?: string; onPress?: () => Promise<void> }[];
    expect(buttons.map((b) => b.text)).toEqual(['Cancel', 'Delete']);
    await buttons[1].onPress!();
    expect(deleteWeightEntriesForDate).toHaveBeenCalledWith(entry.date);
    expect(syncToSupabase).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalled();
    alert.mockRestore();
  });
});
