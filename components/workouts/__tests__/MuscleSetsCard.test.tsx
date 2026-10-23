import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { MuscleSetsCard } from '@/components/workouts/MuscleSetsCard';
import { volumeTargetProgress } from '@/lib/workouts/targets';
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => 'gray' }));
test('renders zero counts, exact over-target counts, status and an accessible edit action', async () => {
  const edit = jest.fn();
  await render(<MuscleSetsCard rows={volumeTargetProgress([{ region: 'Chest', sets: 14 }, { region: 'Lats', sets: 10 }], { Chest: 12, Lats: 10, Quads: 10 })} onEditTargets={edit} />);
  expect(screen.getByLabelText('Chest, 14 of 12 sets, Over target')).toBeTruthy();
  expect(screen.getByLabelText('Lats, 10 of 10 sets, Met')).toBeTruthy();
  expect(screen.getByLabelText('Quads, 0 of 10 sets, Under target')).toBeTruthy();
  expect(screen.getByText('14 / 12')).toBeTruthy();
  expect(screen.getByTestId('volume-target-fill-Chest')).toHaveStyle({ width: '100%' });
  expect(screen.getByTestId('volume-target-fill-Quads')).toHaveStyle({ width: '0%' });
  await fireEvent.press(screen.getByRole('button', { name: 'Edit weekly volume targets' }));
  expect(edit).toHaveBeenCalled();
});
test('hides an entirely empty card', async () => {
  await render(<MuscleSetsCard rows={[]} onEditTargets={jest.fn()} />);
  expect(screen.queryByText('Sets')).toBeNull();
});
