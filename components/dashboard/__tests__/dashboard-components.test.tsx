import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import * as Notifications from 'expo-notifications';
import { EditModeBar } from '@/components/dashboard/EditModeBar';
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

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

// The native time picker needs a SafeAreaProvider; it is not under test here.
jest.mock('@/components/time-picker-sheet', () => ({ TimePickerSheet: () => null }));

// Model bubbling on the rendered host ancestry. Native responder arbitration
// still requires a device check; fireEvent alone stops at the first handler.
function eventHandler(target: ReturnType<typeof screen.getByText>, name: 'onPress' | 'onLongPress') {
  // RNTL 14 exposes host nodes only, with composite handlers on their owning fibers.
  for (let fiber = target.unstable_fiber; fiber; fiber = fiber.return) {
    const handler = fiber.memoizedProps?.[name] ?? fiber.memoizedProps?.[`testOnly_${name}`];
    if (typeof handler === 'function') return handler;
    if (!fiber.return || typeof fiber.return.type === 'string') break;
  }
  return undefined;
}

async function bubbleEvent(target: ReturnType<typeof screen.getByText>, name: 'onPress' | 'onLongPress') {
  let stopped = false;
  const event = { stopPropagation: jest.fn(() => { stopped = true; }) };
  await act(() => {
    for (let node: typeof target | null = target; node && !stopped; node = node.parent) {
      const handler = eventHandler(node, name);
      if (typeof handler === 'function') {
        handler(event);
      }
    }
  });
  return event;
}

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
    await render(<FoodLogRow log={makeLog({ food_calories: 101 })} />);
    expect(screen.getByText('Oatmeal')).toBeTruthy();
    expect(screen.getByText('152')).toBeTruthy(); // 101 * 1.5 = 151.5 -> 152
    expect(screen.getByText('1.5 × cup')).toBeTruthy();
  });

  it('shows no trash icon when onDelete is not provided', async () => {
    await render(<FoodLogRow log={makeLog()} />);
    expect(screen.queryByLabelText('Remove Oatmeal')).toBeNull();
  });

  it('calls onEdit with the log when the row is pressed', async () => {
    const onEdit = jest.fn();
    const log = makeLog();
    await render(<FoodLogRow log={log} onEdit={onEdit} />);
    await fireEvent.press(screen.getByText('Oatmeal'));
    expect(onEdit).toHaveBeenCalledWith(log);
  });

  it('calls onDelete (not onEdit) when the trash icon is pressed', async () => {
    const onDelete = jest.fn();
    const onEdit = jest.fn();
    const log = makeLog();
    await render(<FoodLogRow log={log} onEdit={onEdit} onDelete={onDelete} />);
    await fireEvent.press(screen.getByLabelText('Remove Oatmeal'));
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
  });

  it('nutrition has its own action for empty and orphan meals and leaves other controls independent', async () => {
    const props = baseProps();
    const onShowNutrition = jest.fn();
    const { rerender } = await render(<MealSlotCard {...props} onShowNutrition={onShowNutrition} />);
    await fireEvent.press(screen.getByLabelText('Nutrition summary for Breakfast'));
    expect(onShowNutrition).toHaveBeenCalledWith('breakfast', null);
    expect(props.onAdd).not.toHaveBeenCalled();
    expect(props.onToggle).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Add food to Breakfast'));
    await fireEvent.press(screen.getByLabelText('Breakfast, Eaten'));
    expect(props.onAdd).toHaveBeenCalledWith('breakfast');
    expect(props.onToggle).toHaveBeenCalledWith('breakfast');
    await rerender(<MealSlotCard {...props} label="Other" allowAdd={false} onShowNutrition={onShowNutrition} />);
    expect(screen.getByLabelText('Nutrition summary for Other')).toBeTruthy();
  });

  it.each([true, false])('card and header open once for populated eaten=%s with independent controls', async (eaten) => {
    const props = baseProps();
    const onShowNutrition = jest.fn();
    await render(<MealSlotCard {...props} eaten={eaten} logs={[makeLog()]} onShowNutrition={onShowNutrition} />);
    expect(screen.queryByText('Nutrition')).toBeNull();
    const header = screen.getByRole('button', { name: 'Nutrition summary for Breakfast' });
    expect(screen.getByRole('button', { name: 'Edit Oatmeal' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove Oatmeal' })).toBeTruthy();
    const event = await bubbleEvent(header, 'onPress');
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(onShowNutrition).toHaveBeenCalledTimes(1);
    let outer = header.parent!;
    while (outer.props.accessible !== false) outer = outer.parent!;
    await bubbleEvent(outer, 'onPress');
    expect(onShowNutrition).toHaveBeenCalledTimes(2);
    onShowNutrition.mockClear();
    for (const [name, action, callback] of [
      ['Add food to Breakfast', 'onPress', props.onAdd],
      [`Breakfast, ${eaten ? 'Eaten' : 'Planned'}`, 'onPress', props.onToggle],
      ['Edit Oatmeal', 'onPress', props.onEditLog],
      ['Edit Oatmeal', 'onLongPress', props.onDeleteLog],
      ['Remove Oatmeal', 'onPress', props.onDeleteLog],
    ] as const) {
      const before = callback.mock.calls.length;
      const nested = await bubbleEvent(screen.getByRole('button', { name }), action);
      expect(nested.stopPropagation).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledTimes(before + 1);
      expect(onShowNutrition).not.toHaveBeenCalled();
    }
    expect(props.onEditLog).toHaveBeenCalledTimes(1);
    expect(props.onDeleteLog).toHaveBeenCalledTimes(2);
  });

  it('has no summary action when its callback is unavailable', async () => {
    await render(<MealSlotCard {...baseProps()} />);
    expect(screen.queryByRole('button', { name: /Nutrition summary/ })).toBeNull();
    const header = screen.getByText('Breakfast').parent!.parent!;
    expect(header.props.accessibilityRole).toBeUndefined();
    expect(eventHandler(header, 'onPress')).toBeUndefined();
    expect(eventHandler(header.parent!.parent!, 'onPress')).toBeUndefined();
  });

  it('empty state opens the summary through neutral body text, while plus alone adds', async () => {
    const props = baseProps();
    const onShowNutrition = jest.fn();
    await render(<MealSlotCard {...props} onShowNutrition={onShowNutrition} />);
    await bubbleEvent(screen.getByText('No food logged'), 'onPress');
    expect(onShowNutrition).toHaveBeenCalledTimes(1);
    expect(props.onAdd).not.toHaveBeenCalled();
    await bubbleEvent(screen.getByRole('button', { name: 'Add food to Breakfast' }), 'onPress');
    expect(props.onAdd).toHaveBeenCalledWith('breakfast');
    expect(onShowNutrition).toHaveBeenCalledTimes(1);
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
    expect(screen.getByText('222')).toBeTruthy(); // 151.5 + 70 = 221.5 -> 222
    expect(screen.getByText('Egg')).toBeTruthy();
    expect(screen.queryByText('No food logged')).toBeNull();
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
  });

  it('shows "x / target cal" and macro targets when set', async () => {
    await render(<MealSlotCard {...props()} targets={targets} />);
    expect(screen.getByText('320 / 500 cal · Protein 32 / 40 g')).toBeTruthy();
    expect(screen.getAllByText('320')).toHaveLength(2); // header total and the log row
  });

  it('keeps plain calories without a calorie target', async () => {
    await render(<MealSlotCard {...props()} targets={{ ...targets, calorie_target: null }} />);
    expect(screen.getAllByText('320')).toHaveLength(2);
    expect(screen.getByText('Protein 32 / 40 g')).toBeTruthy();
  });

  it('summarizes the macros in whole grams when there are no targets', async () => {
    await render(<MealSlotCard {...props()} targets={null} />);
    expect(screen.getByText('P 32 · C 64 · F 6')).toBeTruthy();
  });

  it('shows a pressable Eaten tag that toggles the status', async () => {
    const p = props();
    await render(<MealSlotCard {...p} />);
    expect(screen.getByText('Eaten')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Breakfast, Eaten'));
    expect(p.onToggle).toHaveBeenCalledWith('breakfast');
  });

  it('shows a bell labelled with the reminder time', async () => {
    await render(<MealSlotCard {...props()} targets={{ ...targets, reminder_time: '12:30' }} />);
    expect(screen.getByLabelText(/^Reminder at /)).toBeTruthy();
  });

  it('hides add affordances when allowAdd is false', async () => {
    await render(<MealSlotCard {...props()} logs={[]} allowAdd={false} />);
    expect(screen.queryByLabelText('Add food to Breakfast')).toBeNull();
    expect(screen.getByText('No food logged')).toBeTruthy();
  });
});

describe('MealSlotCard edit mode', () => {
  const editProps = () => ({
    mode: 'edit' as const,
    slot: 'breakfast',
    label: 'Breakfast',
    logs: [makeLog({ food_calories: 100, serving_amount: 1 }), makeLog({ id: 'l2', food_calories: 50, serving_amount: 1 })],
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
    expect(screen.getByText('No reminder')).toBeTruthy();
    expect(screen.queryByText('Eaten')).toBeNull();
    expect(screen.queryByText('Nutrition')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nutrition summary for Breakfast' })).toBeNull();
    expect(screen.queryByLabelText('Add food to Breakfast')).toBeNull();
    expect(screen.queryByText('Oatmeal')).toBeNull();
  });

  it('shows the name error instead of the summary', async () => {
    await render(<MealSlotCard {...editProps()} nameError="Enter a name" />);
    expect(screen.getByText('Enter a name')).toBeTruthy();
    expect(screen.queryByText('No reminder')).toBeNull();
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
    expect(screen.getByText(/^Reminder 12:30/)).toBeTruthy();
    expect(screen.queryByText('No reminder')).toBeNull();
  });

  it('opens the sheet even when a stored reminder time is malformed', async () => {
    const t = { calorie_target: null, protein_target: null, carb_target: null, fat_target: null, reminder_time: '25:99' };
    await render(<MealSlotCard {...editProps()} targets={t} />);
    await fireEvent.press(screen.getByLabelText('Targets and reminder, Breakfast'));
    expect(screen.getByText('Save')).toBeTruthy();
  });

  it('saves targets from the sheet', async () => {
    const props = editProps();
    await render(<MealSlotCard {...props} />);
    await fireEvent.press(screen.getByLabelText('Targets and reminder, Breakfast'));
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
    await fireEvent.press(screen.getByLabelText('Targets and reminder, Breakfast'));
    await fireEvent(screen.getByLabelText('Breakfast daily reminder'), 'valueChange', true);
    expect(await screen.findByLabelText(/^Reminder time, /)).toBeTruthy();
    await fireEvent.press(screen.getByText('Save'));
    expect(props.onChangeSettings).toHaveBeenCalledWith(expect.anything(), '12:00');
  });

  it('keeps the reminder off and offers system settings when permission is denied', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false, canAskAgain: false });
    const props = editProps();
    await render(<MealSlotCard {...props} />);
    await fireEvent.press(screen.getByLabelText('Targets and reminder, Breakfast'));
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await fireEvent(screen.getByLabelText('Breakfast daily reminder'), 'valueChange', true);
    expect(await screen.findByLabelText('Open settings')).toBeTruthy();
    expect(announce).toHaveBeenCalledWith('Notifications are off for BinoFit.');
    announce.mockRestore();
    expect(screen.queryByLabelText(/^Reminder time, /)).toBeNull();
  });
});

describe('FoodLogRow accessibility', () => {
  it('labels the trash button with the food name', async () => {
    await render(<FoodLogRow log={makeLog()} onDelete={jest.fn()} />);
    expect(screen.getByLabelText('Remove Oatmeal')).toBeTruthy();
  });
});

describe('EditModeBar', () => {
  const renderBar = async (over: Partial<React.ComponentProps<typeof EditModeBar>> = {}) => {
    const onCancel = jest.fn();
    const onDone = jest.fn();
    await render(
      <EditModeBar onCancel={onCancel} onDone={onDone} errorCount={0} saving={false} {...over} />
    );
    return { onCancel, onDone };
  };

  it('fires Cancel and Done', async () => {
    const { onCancel, onDone } = await renderBar();
    await fireEvent.press(screen.getByLabelText('Cancel editing'));
    await fireEvent.press(screen.getByLabelText('Done editing'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/to save/)).toBeNull();
  });

  it('disables Done and explains why when the draft has errors', async () => {
    const { onDone } = await renderBar({ errorCount: 1 });
    const done = screen.getByLabelText('Done editing');
    expect(done.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await fireEvent.press(done);
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText('Fix 1 error to save')).toBeTruthy();
  });

  it('counts several errors', async () => {
    await renderBar({ errorCount: 2 });
    expect(screen.getByText('Fix 2 errors to save')).toBeTruthy();
  });

  it('disables Done and Cancel without the error note while saving', async () => {
    const { onCancel, onDone } = await renderBar({ saving: true });
    await fireEvent.press(screen.getByLabelText('Done editing'));
    await fireEvent.press(screen.getByLabelText('Cancel editing'));
    expect(onDone).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.queryByText(/to save/)).toBeNull();
  });
});


test('serving captions round without changing calorie math or the log', async () => {
  const log = makeLog({ serving_amount: 1.234567, food_calories: 1000 });
  await render(<FoodLogRow log={log} />);
  expect(screen.getByText('1.23 × cup')).toBeTruthy();
  expect(screen.getByText('1235')).toBeTruthy();
  expect(log.serving_amount).toBe(1.234567);
});
