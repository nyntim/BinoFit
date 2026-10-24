import { fireEvent, render, screen } from '@testing-library/react-native';
import { ScanMissSheet, type MissPhase } from '@/components/barcode-scanner/ScanMissSheet';

jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: (_: unknown, name: string) => name }));
jest.mock('@/components/ui/icon-symbol', () => ({ IconSymbol: () => null }));

const handlers = () => ({ onLookup: jest.fn(), onCreate: jest.fn(), onRescan: jest.fn(), onSearch: jest.fn() });
const show = async (phase: MissPhase, h = handlers()) => {
  await render(<ScanMissSheet phase={phase} {...h} />);
  return h;
};

test('not found creates a food with this barcode', async () => {
  const h = await show({ kind: 'not_found', code: '5000112637922' });
  expect(screen.getByText('Not found yet')).toBeTruthy();
  expect(screen.getByLabelText('Barcode not found')).toBeTruthy();
  await fireEvent.press(screen.getByText('Create food with this barcode'));
  expect(h.onCreate).toHaveBeenCalledWith({ barcode: '5000112637922' });
});

test('incomplete passes the name and brand to the new food', async () => {
  const h = await show({ kind: 'incomplete', code: '123', name: 'Oat drink', brand: 'Oatly' });
  expect(screen.getByText('Missing nutrition')).toBeTruthy();
  await fireEvent.press(screen.getByText('Create food with this barcode'));
  expect(h.onCreate).toHaveBeenCalledWith({ barcode: '123', name: 'Oat drink', brand: 'Oatly' });
});

test('an error offers Retry and still offers Create', async () => {
  const h = await show({ kind: 'error', code: '123' });
  expect(screen.getByText("Couldn't reach Open Food Facts.")).toBeTruthy();
  await fireEvent.press(screen.getByText('Retry'));
  expect(h.onLookup).toHaveBeenCalledWith('123');
  await fireEvent.press(screen.getByText('Create food with this barcode'));
  expect(h.onCreate).toHaveBeenCalledWith({ barcode: '123' });
});

test('Scan again and Search by name call their handlers', async () => {
  const h = await show({ kind: 'not_found', code: '123' });
  await fireEvent.press(screen.getByText('Scan again'));
  await fireEvent.press(screen.getByText('Search by name'));
  expect(h.onRescan).toHaveBeenCalledTimes(1);
  expect(h.onSearch).toHaveBeenCalledTimes(1);
});

test('submitting the field looks up the edited digits', async () => {
  const h = await show({ kind: 'not_found', code: '123' });
  const field = screen.getByLabelText('Barcode');
  expect(field.props.value).toBe('123');
  await fireEvent.changeText(field, '5000112637922');
  await fireEvent(field, 'submitEditing');
  expect(h.onLookup).toHaveBeenCalledWith('5000112637922');
});
