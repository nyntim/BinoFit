import React from 'react';
import { Linking } from 'react-native';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import AboutSettings from '@/app/settings/about';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useNavigation: () => ({}) }));
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.0.0' } }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => '#333333' }));

beforeEach(() => { jest.clearAllMocks(); });
afterEach(() => { cleanup(); jest.restoreAllMocks(); });

test('About shows the app version and build', async () => {
  await render(<AboutSettings />);
  expect(screen.getByText('Version 1.0.0 · Build Unavailable')).toBeTruthy();
});

test('About names the food sources and opens accessible source and license links', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  await render(<AboutSettings />);
  expect(screen.getByText(/Food data from Open Food Facts.*Open Database License/)).toBeTruthy();
  const urls = ['https://fdc.nal.usda.gov/', 'https://world.openfoodfacts.org/', 'https://opendatacommons.org/licenses/odbl/1-0/'];
  const links = screen.getAllByRole('link');
  expect(links).toHaveLength(urls.length);
  for (let i = 0; i < links.length; i++) {
    await fireEvent.press(links[i]);
    expect(open).toHaveBeenLastCalledWith(urls[i]);
  }
});

test('About reports a link failure and allows retry', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(undefined);
  await render(<AboutSettings />);
  const link = screen.getAllByRole('link')[1];
  await fireEvent.press(link);
  expect(await screen.findByText('Could not open Open Food Facts. Try again.')).toBeTruthy();
  await fireEvent.press(link);
  expect(screen.queryByText('Could not open Open Food Facts. Try again.')).toBeNull();
  expect(open).toHaveBeenCalledTimes(2);
});
