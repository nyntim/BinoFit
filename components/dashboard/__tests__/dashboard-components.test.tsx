import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { Colors } from '@/constants/theme';
import { FoodLogRow } from '@/components/dashboard/FoodLogRow';
import { MealSlotCard } from '@/components/dashboard/MealSlotCard';
import type { FoodLogWithFood } from '@/lib/types';

// Render the icon name as text so icons can be queried without loading the icon font.
jest.mock('@expo/vector-icons/MaterialIcons', () => {
  const { Text: RNText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <RNText>{`icon:${name}`}</RNText>,
  };
});

// The native time picker needs a SafeAreaProvider; it is not under test here.
jest.mock('@/components/time-picker-sheet', () => ({ TimePickerSheet: () => null }));

const colors = Colors.light;

const makeLog = (over: Partial<FoodLogWithFood> = {}): FoodLogWithFood => ({
  id: 'l1',
  date: '2026-01-01',
  meal_slot: 'breakfast',
  food_id: 'f1',
  serving_amount: 1.5,
  serving_unit: 'cup',
  created_at: '',
  updated_at: '',
  food_name: 'Oatmeal',
  food_brand: null,
  food_calories: 100,
  food_protein: 5,
  food_carbs: 20,
  food_fat: 2,
  food_serving_units: 'cup',
  ...over,
});

describe('FoodLogRow', () => {
  it('renders the food name, serving text and rounded calories', async () => {
    await render(<FoodLogRow log={makeLog({ food_calories: 101 })} colors={colors} />);
    expect(screen.getByText('Oatmeal')).toBeTruthy();
    expect(screen.getByText('152')).toBeTruthy(); // 101 * 1.5 = 151.5 -> 152
    expect(screen.getByText('1.5 × cup')).toBeTruthy();
  });

  it('shows no trash icon when onDelete is not provided', async () => {
    await render(<FoodLogRow log={makeLog()} colors={colors} />);
    expect(screen.queryByText('icon:delete-outline')).toBeNull();
  });

  it('calls onEdit with the log when the row is pressed', async () => {
    const onEdit = jest.fn();
    const log = makeLog();
    await render(<FoodLogRow log={log} colors={colors} onEdit={onEdit} />);
    await fireEvent.press(screen.getByText('Oatmeal'));
    expect(onEdit).toHaveBeenCalledWith(log);
  });

  it('calls onDelete (not onEdit) when the trash icon is pressed', async () => {
    const onDelete = jest.fn();
    const onEdit = jest.fn();
    const log = makeLog();
    await render(<FoodLogRow log={log} colors={colors} onEdit={onEdit} onDelete={onDelete} />);
    await fireEvent.press(screen.getByText('icon:delete-outline'));
    expect(onDelete).toHaveBeenCalledWith(log);
    expect(onEdit).not.toHaveBeenCalled();
  });
});

describe('MealSlotCard', () => {
  const baseProps = () => ({
    slot: 'breakfast' as const,
    label: 'Breakfast',
    logs: [] as FoodLogWithFood[],
    eaten: true,
    showToggle: true,
    onToggle: jest.fn(),
    onAdd: jest.fn(),
    onEditLog: jest.fn(),
    onDeleteLog: jest.fn(),
    colors,
  });

  it('empty state shows "Tap to add food" and calls onAdd with the slot', async () => {
    const props = baseProps();
    await render(<MealSlotCard {...props} />);
    await fireEvent.press(screen.getByText('Tap to add food'));
    expect(props.onAdd).toHaveBeenCalledWith('breakfast');
    expect(screen.queryByText(/ cal$/)).toBeNull();
  });

  it('hides the Eaten/Planned pill when showToggle is false', async () => {
    await render(<MealSlotCard {...baseProps()} showToggle={false} />);
    expect(screen.queryByText('Eaten')).toBeNull();
    expect(screen.queryByText('Planned')).toBeNull();
    expect(screen.queryByLabelText('Breakfast, Eaten')).toBeNull();
  });

  it('pill shows Eaten when eaten and calls onToggle with the slot', async () => {
    const props = baseProps();
    await render(<MealSlotCard {...props} />);
    expect(screen.getByText('Eaten')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Breakfast, Eaten'));
    expect(props.onToggle).toHaveBeenCalledWith('breakfast');
  });

  it('pill shows Planned when not eaten', async () => {
    await render(<MealSlotCard {...baseProps()} eaten={false} />);
    expect(screen.getByText('Planned')).toBeTruthy();
    expect(screen.getByLabelText('Breakfast, Planned')).toBeTruthy();
  });

  it('add button has an accessible label and calls onAdd', async () => {
    const props = baseProps();
    await render(<MealSlotCard {...props} />);
    await fireEvent.press(screen.getByLabelText('Add food to Breakfast'));
    expect(props.onAdd).toHaveBeenCalledWith('breakfast');
  });

  it('shows rounded slot calories and log rows, and hides the empty prompt', async () => {
    const props = baseProps();
    const logs = [
      makeLog({ id: 'a', food_calories: 101 }),
      makeLog({ id: 'b', food_name: 'Egg', food_calories: 70, serving_amount: 1 }),
    ];
    await render(<MealSlotCard {...props} logs={logs} eaten={false} />);
    expect(screen.getByText('222 cal')).toBeTruthy(); // 151.5 + 70 = 221.5 -> 222
    expect(screen.getByText('Egg')).toBeTruthy();
    expect(screen.queryByText('Tap to add food')).toBeNull();
    await fireEvent.press(screen.getByText('Egg'));
    expect(props.onEditLog).toHaveBeenCalledWith(logs[1]);
  });
});

describe('MealSlotCard targets (view mode)', () => {
  const targets = { calorie_target: 500, protein_target: 40, carb_target: null, fat_target: null };
  const props = () => ({
    slot: 'breakfast',
    label: 'Breakfast',
    logs: [makeLog({ food_calories: 100, serving_amount: 3.2, food_protein: 10 })],
    eaten: true,
    showToggle: true,
    onToggle: jest.fn(),
    onAdd: jest.fn(),
    onEditLog: jest.fn(),
    onDeleteLog: jest.fn(),
    colors,
  });

  it('shows "x / target cal" and macro targets when set', async () => {
    await render(<MealSlotCard {...props()} targets={targets} />);
    expect(screen.getByText('320 / 500 cal')).toBeTruthy();
    expect(screen.getByText('Protein 32 / 40 g')).toBeTruthy();
  });

  it('keeps plain calories without a calorie target', async () => {
    await render(<MealSlotCard {...props()} targets={{ ...targets, calorie_target: null }} />);
    expect(screen.getByText('320 cal')).toBeTruthy();
  });

  it('shows a bell labelled with the reminder time', async () => {
    await render(<MealSlotCard {...props()} targets={{ ...targets, reminder_time: '12:30' }} />);
    expect(screen.getByLabelText(/^Reminder at /)).toBeTruthy();
  });

  it('hides add affordances when allowAdd is false', async () => {
    await render(<MealSlotCard {...props()} logs={[]} allowAdd={false} />);
    expect(screen.queryByLabelText('Add food to Breakfast')).toBeNull();
    expect(screen.queryByText('Tap to add food')).toBeNull();
  });
});

describe('MealSlotCard edit mode', () => {
  const editProps = () => ({
    mode: 'edit' as const,
    slot: 'breakfast',
    label: 'Breakfast',
    logs: [makeLog({ food_calories: 100, serving_amount: 1 }), makeLog({ id: 'l2', food_calories: 50, serving_amount: 1 })],
    colors,
    index: 0,
    nameError: null as string | null,
    canDelete: true,
    dragHandle: null,
    onChangeName: jest.fn(),
    onChangeSettings: jest.fn(),
    onDelete: jest.fn(),
  });

  it('collapses logs to a summary and hides status, add and log actions', async () => {
    await render(<MealSlotCard {...editProps()} />);
    expect(screen.getByText('2 items · 150 cal')).toBeTruthy();
    expect(screen.queryByText('Eaten')).toBeNull();
    expect(screen.queryByLabelText('Add food to Breakfast')).toBeNull();
    expect(screen.queryByText('Oatmeal')).toBeNull();
  });

  it('shows the name error instead of the summary', async () => {
    await render(<MealSlotCard {...editProps()} nameError="Enter a name" />);
    expect(screen.getByText('Enter a name')).toBeTruthy();
    expect(screen.queryByText('2 items · 150 cal')).toBeNull();
  });

  it('edits the name and deletes through callbacks', async () => {
    const props = editProps();
    await render(<MealSlotCard {...props} />);
    await fireEvent.changeText(screen.getByLabelText('Meal 1 name'), 'Brunch');
    expect(props.onChangeName).toHaveBeenCalledWith('Brunch');
    await fireEvent.press(screen.getByLabelText('Delete Breakfast'));
    expect(props.onDelete).toHaveBeenCalled();
  });

  it('does not delete when it is the last meal', async () => {
    const props = editProps();
    await render(<MealSlotCard {...props} canDelete={false} />);
    await fireEvent.press(screen.getByLabelText('Delete Breakfast'));
    expect(props.onDelete).not.toHaveBeenCalled();
  });

  it('shows the reminder time in the caption', async () => {
    const t = { calorie_target: null, protein_target: null, carb_target: null, fat_target: null, reminder_time: '12:30' };
    await render(<MealSlotCard {...editProps()} targets={t} />);
    expect(screen.getByText(/2 items · 150 cal · .*reminder/)).toBeTruthy();
  });

  it('saves targets from the sheet', async () => {
    const props = editProps();
    await render(<MealSlotCard {...props} />);
    await fireEvent.press(screen.getByLabelText('Targets and reminder for Breakfast'));
    await fireEvent.changeText(screen.getByLabelText('Breakfast calories target'), '500');
    await fireEvent.press(screen.getByText('Save'));
    expect(props.onChangeSettings).toHaveBeenCalledWith(
      { calorie_target: 500, protein_target: null, carb_target: null, fat_target: null },
      null
    );
  });

  it('turns a reminder on with a default time once permission is granted', async () => {
    const props = editProps();
    await render(<MealSlotCard {...props} />);
    await fireEvent.press(screen.getByLabelText('Targets and reminder for Breakfast'));
    await fireEvent(screen.getByLabelText('Breakfast daily reminder'), 'valueChange', true);
    expect(await screen.findByLabelText(/^Reminder time, /)).toBeTruthy();
    await fireEvent.press(screen.getByText('Save'));
    expect(props.onChangeSettings).toHaveBeenCalledWith(expect.anything(), '12:00');
  });

  it('keeps the reminder off and offers system settings when permission is denied', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false, canAskAgain: false });
    const props = editProps();
    await render(<MealSlotCard {...props} />);
    await fireEvent.press(screen.getByLabelText('Targets and reminder for Breakfast'));
    await fireEvent(screen.getByLabelText('Breakfast daily reminder'), 'valueChange', true);
    expect(await screen.findByLabelText('Open system settings')).toBeTruthy();
    expect(screen.queryByLabelText(/^Reminder time, /)).toBeNull();
  });
});

describe('FoodLogRow accessibility', () => {
  it('labels the trash button with the food name', async () => {
    await render(<FoodLogRow log={makeLog()} colors={colors} onDelete={jest.fn()} />);
    expect(screen.getByLabelText('Remove Oatmeal')).toBeTruthy();
  });
});
