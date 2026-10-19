import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NutritionSettingsSheet } from '@/components/settings/TabSettingsSheet';

const mockFlush = jest.fn<Promise<boolean>, []>();
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => '#333333' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('@/components/settings/NutritionSection', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { NutritionSection: React.forwardRef(function MockNutritionSection(_props: unknown, ref: React.Ref<unknown>) {
    React.useImperativeHandle(ref, () => ({ flush: mockFlush }));
    return <Text>Daily goals</Text>;
  }) };
});

test('Done waits for nutrition writes and retains sheet after a failed flush', async () => {
  const onClose = jest.fn();
  mockFlush.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  await render(<NutritionSettingsSheet visible onClose={onClose} onManageReminders={() => {}} />);
  expect(screen.getByText('Daily goals')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Done'));
  await waitFor(() => expect(mockFlush).toHaveBeenCalledTimes(1));
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Done'));
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
});
