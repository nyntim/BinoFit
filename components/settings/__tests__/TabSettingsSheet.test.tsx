import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { TrainingSettingsSheet } from '@/components/settings/TabSettingsSheet';

jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => '#333333' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('@/components/settings/TrainingSection', () => ({ TrainingSection: () => null }));

test('training sheet shows scoped rest guidance and closes with Done', async () => {
  const onClose = jest.fn();
  await render(<TrainingSettingsSheet visible onClose={onClose} />);
  expect(screen.getByText('Training settings')).toBeTruthy();
  expect(screen.getByText('Set rest time in each exercise’s options. Choose Off to disable it.')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Done'));
  expect(onClose).toHaveBeenCalledTimes(1);
});
