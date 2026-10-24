import { AccessibilityInfo, Animated, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Card } from '@/components/ui/Card';
import { CelebrationBanner } from '@/components/ui/CelebrationBanner';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconTile } from '@/components/ui/IconTile';
import { ListGroup, ListRow } from '@/components/ui/ListGroup';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SheetHeader } from '@/components/ui/SheetHeader';
import { StickyFooter } from '@/components/ui/StickyFooter';
import { Tag } from '@/components/ui/Tag';
import { Colors } from '@/constants/theme';

jest.mock('@/components/ui/icon-symbol', () => ({ IconSymbol: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 20, left: 0 }) }));

const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('Card', () => {
  it('draws the light card surface with its shadow', async () => {
    await render(<Card testID="card"><Text>Body</Text></Card>);
    const style = flat(screen.getByTestId('card').props.style);
    expect(style.backgroundColor).toBe(Colors.light.cardBackground);
    expect(style.boxShadow).toBeTruthy();
    expect(style.paddingHorizontal).toBe(20);
  });

  it('uses the soft fill and no shadow for a toned card', async () => {
    await render(<Card testID="card" tone="ember" padding="compact"><Text>Body</Text></Card>);
    const style = flat(screen.getByTestId('card').props.style);
    expect(style.backgroundColor).toBe(Colors.light.emberSoft);
    expect(style.boxShadow).toBeUndefined();
    expect(style.paddingHorizontal).toBe(16);
  });
});

describe('ListGroup and ListRow', () => {
  it('separates rows and gives tappable rows a button role', async () => {
    const onPress = jest.fn();
    await render(
      <ListGroup>
        <ListRow title="Profile" onPress={onPress} />
        <ListRow title="Version" trailing="1.4.0" />
        {null}
      </ListGroup>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Profile' }));
    expect(onPress).toHaveBeenCalled();
    expect(screen.getByText('1.4.0')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(1);
  });

  it('passes radio role and selected state through', async () => {
    await render(<ListRow title="Dark" onPress={jest.fn()} accessibilityRole="radio" accessibilityLabel="Dark" accessibilityState={{ selected: true }} />);
    expect(screen.getByRole('radio', { name: 'Dark' }).props.accessibilityState).toEqual({ selected: true, disabled: false });
  });

  it('ignores presses while disabled', async () => {
    const onPress = jest.fn();
    await render(<ListRow title="Sync now" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sync now' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('IconTile and Tag', () => {
  it('hides the icon tile from assistive tech', async () => {
    await render(<IconTile icon="flame.fill" tone="ember" size={40} />);
    const tile = screen.getByTestId('icon-tile', { includeHiddenElements: true });
    expect(tile.props.accessibilityElementsHidden).toBe(true);
    expect(flat(tile.props.style)).toMatchObject({ width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.light.emberSoft });
  });

  it('renders the tag label', async () => {
    await render(<Tag label="Eaten" tone="tint" />);
    expect(screen.getByText('Eaten')).toBeTruthy();
  });
});

describe('ProgressBar', () => {
  it('exposes a labelled progress value', async () => {
    await render(<ProgressBar value={112} max={160} accessibilityLabel="Protein 112 of 160 grams" />);
    const bar = screen.getByLabelText('Protein 112 of 160 grams');
    expect(bar.props.accessibilityRole).toBe('progressbar');
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 160, now: 112 });
    expect(flat(screen.getByTestId('progress-fill').props.style).width).toBe('70%');
  });

  it('caps the fill at a full bar when over max', async () => {
    await render(<ProgressBar value={2400} max={2000} />);
    expect(flat(screen.getByTestId('progress-fill', { includeHiddenElements: true }).props.style).width).toBe('100%');
  });

  it('draws the preview segment after the fill', async () => {
    await render(<ProgressBar value={50} max={100} preview={25} previewColor="#ABCDEF" />);
    const preview = flat(screen.getByTestId('progress-preview', { includeHiddenElements: true }).props.style);
    expect(preview.width).toBe('75%');
    expect(preview.backgroundColor).toBe('#ABCDEF');
  });

  it('omits the preview when nothing is added', async () => {
    await render(<ProgressBar value={50} max={100} />);
    expect(screen.queryByTestId('progress-preview', { includeHiddenElements: true })).toBeNull();
  });
});

describe('SheetHeader', () => {
  it('renders cancel, a header title and the action', async () => {
    const onCancel = jest.fn();
    const onSave = jest.fn();
    await render(<SheetHeader title="Meal 2" onCancel={onCancel} action={{ label: 'Save', onPress: onSave }} grabber />);
    expect(screen.getByRole('header', { name: 'Meal 2' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSave).toHaveBeenCalled();
  });

  it('disables the action while saving', async () => {
    const onSave = jest.fn();
    await render(<SheetHeader title="Log weight" action={{ label: 'Save', onPress: onSave, loading: true }} />);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save.props.accessibilityState).toEqual({ disabled: true, busy: true });
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });
});

describe('StickyFooter', () => {
  it('shows and announces an error message beside the action', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    await render(<StickyFooter message="Fix 1 field to save"><Text>Save</Text></StickyFooter>);
    expect(screen.getByText('Fix 1 field to save')).toBeTruthy();
    expect(announce).toHaveBeenCalledWith('Fix 1 field to save');
    announce.mockRestore();
  });

  it('does not announce a muted message', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    await render(<StickyFooter message="3 foods, 640 cal" messageTone="muted"><Text>Log all</Text></StickyFooter>);
    expect(screen.getByText('3 foods, 640 cal')).toBeTruthy();
    expect(announce).not.toHaveBeenCalled();
    announce.mockRestore();
  });
});

describe('EmptyState', () => {
  it('renders the title as a header with body and actions', async () => {
    await render(<EmptyState title="Your trends start here" body="Log a few days of food." actions={<Text>Log food</Text>} variant="card" />);
    expect(screen.getByRole('header', { name: 'Your trends start here' })).toBeTruthy();
    expect(screen.getByText('Log a few days of food.')).toBeTruthy();
    expect(screen.getByText('Log food')).toBeTruthy();
  });
});

describe('CelebrationBanner', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reads title and body as one element and announces it', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    await render(<CelebrationBanner title="Workout saved" body="2 new records. Nice work." />);
    expect(screen.getByLabelText('Workout saved. 2 new records. Nice work.')).toBeTruthy();
    expect(announce).toHaveBeenCalledWith('Workout saved. 2 new records. Nice work.');
  });

  it('offers a dismiss button when asked', async () => {
    const onDismiss = jest.fn();
    await render(<CelebrationBanner title="Workout saved" onDismiss={onDismiss} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('stays static with Reduce Motion on', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const timing = jest.spyOn(Animated, 'timing');
    await render(<CelebrationBanner title="All set" />);
    await act(async () => {});
    expect(timing).not.toHaveBeenCalled();
    expect(flat(screen.getByLabelText('All set').parent?.props.style).opacity).toBe(1);
  });

  it('fades in when motion is allowed', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const timing = jest.spyOn(Animated, 'timing');
    await render(<CelebrationBanner title="All set" />);
    await act(async () => {});
    expect(timing).toHaveBeenCalled();
  });
});
