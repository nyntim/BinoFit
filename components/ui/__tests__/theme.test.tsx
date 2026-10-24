import { render, screen } from '@testing-library/react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Shadows } from '@/constants/theme';

const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('theme tokens', () => {
  it('gives every color token a light and a dark value', () => {
    expect(Object.keys(Colors.dark).sort()).toEqual(Object.keys(Colors.light).sort());
  });

  it('replaces streak with ember', () => {
    expect('streak' in Colors.light).toBe(false);
    expect(Colors.light.ember).toBe('#C2410C');
    expect(Colors.dark.ember).toBe('#FF8A3D');
  });

  it('keeps danger apart from the protein color', () => {
    expect(Colors.light.danger).not.toBe('#E74C3C');
  });

  it('shadows cards in light mode only', () => {
    expect(Shadows.light.card).not.toBe('none');
    expect(Shadows.dark.card).toBe('none');
    expect(Object.keys(Shadows.dark).sort()).toEqual(Object.keys(Shadows.light).sort());
  });
});

describe('ThemedText types', () => {
  it('sets the rounded face and tabular figures on number styles', async () => {
    await render(<ThemedText type="hero">1,640</ThemedText>);
    expect(flat(screen.getByText('1,640').props.style)).toMatchObject({ fontFamily: Fonts.rounded, fontWeight: '800', fontVariant: ['tabular-nums'] });
  });

  it('uses secondary ink for captions and section labels', async () => {
    await render(<><ThemedText type="caption">8:42 AM</ThemedText><ThemedText type="section">You</ThemedText></>);
    expect(flat(screen.getByText('8:42 AM').props.style).color).toBe(Colors.light.icon);
    expect(flat(screen.getByText('You').props.style).color).toBe(Colors.light.icon);
  });

  it('keeps the large title at 34 / 800 and lets callers override', async () => {
    await render(<ThemedText type="largeTitle" style={{ fontSize: 30 }}>Settings</ThemedText>);
    expect(flat(screen.getByText('Settings').props.style)).toMatchObject({ fontSize: 30, fontWeight: '800', fontFamily: Fonts.rounded });
  });

  it('still renders the original types', async () => {
    await render(<ThemedText type="defaultSemiBold">Data sources</ThemedText>);
    expect(flat(screen.getByText('Data sources').props.style)).toMatchObject({ fontSize: 16, fontWeight: '600', color: Colors.light.text });
  });
});
