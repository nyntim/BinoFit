import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Stepper } from '@/components/ui/Stepper';

jest.mock('@/components/ui/icon-symbol', () => ({ IconSymbol: () => null }));

describe('Button', () => {
  it('is a named button that fires onPress', async () => {
    const onPress = jest.fn();
    await render(<Button label="Add food" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Add food' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('reports disabled and ignores presses', async () => {
    const onPress = jest.fn();
    await render(<Button label="Save" onPress={onPress} disabled />);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.props.accessibilityState).toMatchObject({ disabled: true, busy: false });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows a spinner and reports busy while loading', async () => {
    const onPress = jest.fn();
    await render(<Button label="Save" onPress={onPress} loading />);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    expect(screen.getByTestId('button-loading')).toBeTruthy();
    expect(screen.queryByText('Save')).toBeNull();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('keeps a 44 pt target for the small size', async () => {
    await render(<Button label="Log" size="sm" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Log' }).props.hitSlop).toEqual({ top: 4, bottom: 4 });
  });

  it('prefers an explicit accessibility label', async () => {
    await render(<Button label="+" accessibilityLabel="Add drink" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Add drink' })).toBeTruthy();
  });
});

describe('Chip', () => {
  it('reports checked for a checkbox chip', async () => {
    const onPress = jest.fn();
    await render(<Chip label="Chest" selected onPress={onPress} />);
    const chip = screen.getByRole('checkbox', { name: 'Chest' });
    expect(chip.props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.press(chip);
    expect(onPress).toHaveBeenCalled();
  });

  it('reports selected for a radio chip', async () => {
    await render(<Chip label="Upper" role="radio" selected={false} onPress={jest.fn()} />);
    expect(screen.getByRole('radio', { name: 'Upper' }).props.accessibilityState).toMatchObject({ selected: false });
  });

  it('renders a static ember chip without a button role', async () => {
    await render(<Chip label="6 days logged" tone="ember" />);
    expect(screen.getByLabelText('6 days logged')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('SegmentedControl', () => {
  const options = [{ value: 'metric', label: 'Metric' }, { value: 'imperial', label: 'Imperial' }] as const;

  it('is a named radio group with one selected option', async () => {
    await render(<SegmentedControl options={[...options]} value="metric" onChange={jest.fn()} accessibilityLabel="Units" />);
    expect(screen.getByLabelText('Units').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByRole('radio', { name: 'Metric' }).props.accessibilityState).toEqual({ selected: true, checked: true });
    expect(screen.getByRole('radio', { name: 'Imperial' }).props.accessibilityState).toEqual({ selected: false, checked: false });
  });

  it('calls onChange with the pressed value', async () => {
    const onChange = jest.fn();
    await render(<SegmentedControl options={[...options]} value="metric" onChange={onChange} accessibilityLabel="Units" />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Imperial' }));
    expect(onChange).toHaveBeenCalledWith('imperial');
  });
});

describe('Stepper', () => {
  it('labels both buttons and shows the value', async () => {
    const onIncrement = jest.fn();
    const onDecrement = jest.fn();
    await render(<Stepper value={3} onIncrement={onIncrement} onDecrement={onDecrement} incrementLabel="More default sets" decrementLabel="Fewer default sets" />);
    expect(screen.getByText('3')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'More default sets' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Fewer default sets' }));
    expect(onIncrement).toHaveBeenCalledTimes(1);
    expect(onDecrement).toHaveBeenCalledTimes(1);
  });

  it('disables a button at its limit', async () => {
    const onDecrement = jest.fn();
    await render(<Stepper value={1} onIncrement={jest.fn()} onDecrement={onDecrement} incrementLabel="More" decrementLabel="Fewer" decrementDisabled />);
    const fewer = screen.getByRole('button', { name: 'Fewer' });
    expect(fewer.props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(fewer);
    expect(onDecrement).not.toHaveBeenCalled();
  });
});
