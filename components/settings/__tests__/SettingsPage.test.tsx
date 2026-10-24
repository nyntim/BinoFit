import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SettingsPage } from '@/components/settings/SettingsPage';

let mockNavigation: object = {};
jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useNavigation: () => mockNavigation }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => 'gray' }));

beforeEach(() => { jest.clearAllMocks(); mockNavigation = {}; });

it('names the screen below in the back button and goes back', async () => {
  mockNavigation = {
    getState: () => ({ index: 1, routes: [{ name: 'training' }, { name: 'weekly-volume-targets' }] }),
    getParent: () => ({ getState: () => ({}) }),
  };
  await render(<SettingsPage title="Weekly volume targets" titleType="heading"><Text>content</Text></SettingsPage>);
  expect(screen.getByText('Training')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Back to Training' }));
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('header', { name: 'Weekly volume targets' })).toBeTruthy();
});

it('falls back to Back when the navigation state is unavailable and honours backLabel', async () => {
  const view = await render(<SettingsPage title="Profile"><Text>content</Text></SettingsPage>);
  expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  await view.rerender(<SettingsPage title="Profile" backLabel="Support"><Text>content</Text></SettingsPage>);
  expect(screen.getByRole('button', { name: 'Back to Support' })).toBeTruthy();
});

it('renders the trailing action and the footer outside the scroll content', async () => {
  await render(<SettingsPage title="Profile" trailing={<Text>Save</Text>} footer={<Text>Footer</Text>}><Text>content</Text></SettingsPage>);
  expect(screen.getByText('Save')).toBeTruthy();
  expect(screen.getByText('Footer')).toBeTruthy();
});
