import { fireEvent, render, screen } from '@testing-library/react-native';
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
