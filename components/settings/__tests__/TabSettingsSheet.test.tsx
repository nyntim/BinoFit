import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { TrainingSettingsSheet } from '@/components/settings/TabSettingsSheet';

jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => '#333333' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('@/hooks/usePreferences', () => ({ usePreferences: () => ({ weightUnit: 'lb', showEffort: false, effortMetric: 'rpe', restTimerEnabled: true, defaultSetCount: 2 }) }));

test('training sheet shows scoped rest guidance and closes with Done', async () => {
  const onClose = jest.fn();
  await render(<TrainingSettingsSheet visible onClose={onClose} />);
  expect(screen.getByText('Training settings')).toBeTruthy();
  expect(screen.getByLabelText('Effort per set')).toBeTruthy();
  expect(screen.getByLabelText('Default sets, 2')).toBeTruthy();
  expect(screen.queryByText('Units')).toBeNull();
  expect(screen.queryAllByRole('radio')).toHaveLength(3);
  expect(screen.getByText('Set rest time in each exercise’s options. Choose Off to disable it.')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Done'));
  expect(onClose).toHaveBeenCalledTimes(1);
});
