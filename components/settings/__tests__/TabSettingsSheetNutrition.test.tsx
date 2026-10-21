import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NutritionSettingsSheet } from '@/components/settings/TabSettingsSheet';

const mockFlush = jest.fn<Promise<boolean>, []>();
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => '#333333' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('@/components/settings/NutritionSection', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text, Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
  return { NutritionSection: React.forwardRef(function MockNutritionSection(props: { onManageReminders: () => void }, ref: React.Ref<unknown>) {
    React.useImperativeHandle(ref, () => ({ flush: mockFlush }));
    return <><Text>Daily goals</Text><Pressable accessibilityRole="button" accessibilityLabel="Manage reminders" onPress={props.onManageReminders}><Text>Manage reminders</Text></Pressable></>;
  }) };
});

test('Done waits for nutrition writes and retains sheet after a failed flush', async () => {
  const onClose = jest.fn();
  mockFlush.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  await render(<NutritionSettingsSheet visible onClose={onClose} onManageReminders={() => {}} />);
  expect(screen.getByText('Daily goals')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Done'));
  await waitFor(() => expect(mockFlush).toHaveBeenCalledTimes(1));
  expect(onClose).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText('Done'));
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
});

test('reminders waits for successful flush, closes, then hands off to meal edit', async () => {
  jest.useFakeTimers();
  try {
    const onClose = jest.fn();
    const onManageReminders = jest.fn();
    let resolve!: (saved: boolean) => void;
    mockFlush.mockImplementationOnce(() => new Promise<boolean>((done) => { resolve = done; }));
    await render(<NutritionSettingsSheet visible onClose={onClose} onManageReminders={onManageReminders} />);
    await fireEvent.press(screen.getByLabelText('Manage reminders'));
    expect(onClose).not.toHaveBeenCalled();
    expect(onManageReminders).not.toHaveBeenCalled();
    await act(async () => { resolve(true); });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onManageReminders).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(350); });
    expect(onManageReminders).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});
