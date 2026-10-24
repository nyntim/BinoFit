import { fireEvent, render, screen } from '@testing-library/react-native';
import { DayWorkouts } from '@/components/dashboard/DayWorkouts';
import { DefaultStatusRow } from '@/components/dashboard/DefaultStatusRow';
import { MacroCard } from '@/components/dashboard/MacroCard';
import { WaterCard } from '@/components/dashboard/WaterCard';
import { setDefaultLogStatus } from '@/lib/app-preferences';
import type { QuickAddDrink, WaterLog, WorkoutSummary } from '@/lib/types';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: (_: unknown, name: string) => name }));
jest.mock('@/components/ui/icon-symbol', () => ({ IconSymbol: () => null }));
jest.mock('@/lib/app-preferences', () => ({ ...jest.requireActual('@/lib/app-preferences'), setDefaultLogStatus: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

test('MacroCard labels each bar with grams eaten against the goal', async () => {
  await render(<MacroCard consumed={{ calories: 0, protein: 80.04, carbs: 120, fat: 30.26 }} goals={{ protein_goal: 169, carb_goal: 200, fat_goal: 65 }} />);
  expect(screen.getByLabelText('Protein, 80 of 169 grams')).toBeTruthy();
  expect(screen.getByLabelText('Carbs, 120 of 200 grams')).toBeTruthy();
  expect(screen.getByLabelText('Fat, 30.3 of 65 grams')).toBeTruthy();
});

describe('DefaultStatusRow', () => {
  test('is a radio group for the status of new food', async () => {
    (setDefaultLogStatus as jest.Mock).mockResolvedValue(undefined);
    await render(<DefaultStatusRow value="eaten" />);
    expect(screen.getByLabelText('Default status for new food')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Eaten', selected: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Planned' }));
    expect(setDefaultLogStatus).toHaveBeenCalledWith('planned');
    expect(screen.getByText(/Planned meals don’t count toward your daily totals/)).toBeTruthy();
  });

  test('shows an alert when saving fails', async () => {
    (setDefaultLogStatus as jest.Mock).mockRejectedValue(new Error('disk'));
    await render(<DefaultStatusRow value="eaten" />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Planned' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t save the food default. Try again.');
  });
});

describe('DayWorkouts', () => {
  const workout: WorkoutSummary = { id: 'w1', date: '2026-10-20', title: 'Push day', subtitle: '', durationLabel: '58 min', detailLabel: '4,820 kg', playlistLabel: null };

  test('a card names the workout, duration and detail, and opens its route', async () => {
    await render(<DayWorkouts workouts={[workout]} />);
    expect(screen.getByText('58 min · 4,820 kg')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Push day. 58 min. 4,820 kg' }));
    expect(mockPush).toHaveBeenCalledWith('/workout/w1');
  });

  test('nothing renders without workouts', async () => {
    const { toJSON } = await render(<DayWorkouts />);
    expect(toJSON()).toBeNull();
  });
});

describe('WaterCard', () => {
  const log: WaterLog = { id: 'a', date: '2026-10-20', amount: 16, drink_name: 'Water' } as WaterLog;
  const drinks: QuickAddDrink[] = [{ id: '1', name: '8 oz Water', amount: 8 }, { id: '2', name: '12 oz Coke Zero', amount: 12 }];
  const props = { logs: [log], quickAddDrinks: drinks, isEditing: false, onAdd: jest.fn(), onOpenDrinkSheet: jest.fn(), onDeleteLog: jest.fn(), onRemoveQuickAdd: jest.fn(), onAddQuickAdd: jest.fn() };

  test('metric users see the total in ml with no target text', async () => {
    await render(<WaterCard {...props} total={40} unit="kg" />);
    expect(screen.getByText('1.18 L')).toBeTruthy();
    expect(screen.queryByText(/128|\//)).toBeNull();
    expect(screen.getByLabelText('5 of 10 glasses')).toBeTruthy();
  });

  test('imperial users see ounces', async () => {
    await render(<WaterCard {...props} total={40} unit="lb" />);
    expect(screen.getByText('40 oz')).toBeTruthy();
    expect(screen.getByText('+ 8 oz')).toBeTruthy();
  });

  test('the quick button logs the first drink and the plus opens the sheet', async () => {
    await render(<WaterCard {...props} total={0} unit="lb" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Add 8 oz Water' }));
    expect(props.onAdd).toHaveBeenCalledWith(8, '8 oz Water');
    await fireEvent.press(screen.getByLabelText('Add a drink'));
    expect(props.onOpenDrinkSheet).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: '12 oz Coke Zero' }));
    expect(props.onAdd).toHaveBeenCalledWith(12, '12 oz Coke Zero');
  });

  test('editing shows remove badges instead of logging', async () => {
    await render(<WaterCard {...props} total={0} unit="lb" isEditing />);
    await fireEvent.press(screen.getByLabelText('Remove 8 oz Water'));
    expect(props.onRemoveQuickAdd).toHaveBeenCalledWith('1');
    expect(screen.queryByLabelText('Add 8 oz Water')).toBeNull();
  });
});
