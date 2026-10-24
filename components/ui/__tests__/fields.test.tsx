import { AccessibilityInfo } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SearchField } from '@/components/ui/SearchField';
import { TextField } from '@/components/ui/TextField';

jest.mock('@/components/ui/icon-symbol', () => ({ IconSymbol: () => null }));

describe('TextField', () => {
  it('uses the label as the accessible name and forwards text', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="Calories" value="" onChangeText={onChangeText} />);
    await fireEvent.changeText(screen.getByLabelText('Calories'), '2200');
    expect(onChangeText).toHaveBeenCalledWith('2200');
    expect(screen.getByText('Calories')).toBeTruthy();
  });

  it('shows the error inline, puts it in the hint and announces it', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    await render(<TextField label="Protein" value="16o" error="Enter a number, like 160." accessibilityHint="Grams per day" />);
    expect(screen.getByText('Enter a number, like 160.')).toBeTruthy();
    expect(screen.getByLabelText('Protein').props.accessibilityHint).toBe('Enter a number, like 160. Grams per day');
    expect(announce).toHaveBeenCalledWith('Enter a number, like 160.');
    announce.mockRestore();
  });

  it('shows a hint caption and a unit suffix when there is no error', async () => {
    await render(<TextField label="Weight" value="80" hint="Optional" suffix="kg" />);
    expect(screen.getByText('Optional')).toBeTruthy();
    expect(screen.getByText('kg')).toBeTruthy();
  });

  it('reports disabled when not editable', async () => {
    await render(<TextField label="Name" value="Bench" editable={false} />);
    expect(screen.getByLabelText('Name').props.accessibilityState).toEqual({ disabled: true });
  });

  it('calls focus and blur handlers', async () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    await render(<TextField label="Name" value="" onFocus={onFocus} onBlur={onBlur} />);
    await fireEvent(screen.getByLabelText('Name'), 'focus');
    await fireEvent(screen.getByLabelText('Name'), 'blur');
    expect(onFocus).toHaveBeenCalled();
    expect(onBlur).toHaveBeenCalled();
  });
});

describe('SearchField', () => {
  it('hides the clear button while empty', async () => {
    await render(<SearchField value="" onChangeText={jest.fn()} placeholder="Search foods" />);
    expect(screen.getByLabelText('Search')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
  });

  it('clears the query', async () => {
    const onChangeText = jest.fn();
    const onClear = jest.fn();
    await render(<SearchField value="oats" onChangeText={onChangeText} onClear={onClear} accessibilityLabel="Search foods" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));
    expect(onChangeText).toHaveBeenCalledWith('');
    expect(onClear).toHaveBeenCalled();
    expect(screen.getByLabelText('Search foods')).toBeTruthy();
  });
});

describe('TextField trailing slot', () => {
  it('renders a labelled control inside the field', async () => {
    const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
    const onPress = jest.fn();
    await render(<TextField label="Password" value="" secureTextEntry trailing={<Pressable accessibilityRole="button" accessibilityLabel="Show password" onPress={onPress}><Text>Show</Text></Pressable>} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    expect(onPress).toHaveBeenCalled();
  });
});
