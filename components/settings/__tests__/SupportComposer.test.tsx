import React from 'react';
import { Alert, Share } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SupportComposer } from '@/components/settings/SupportComposer';
import PrivacyPolicySettings from '@/app/settings/privacy-policy';
import TermsSettings from '@/app/settings/terms';
const mockGuard = jest.fn();
const mockDispatch = jest.fn();
jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useNavigation: () => ({ dispatch: mockDispatch }) }));
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: (...args: unknown[]) => mockGuard(...args) }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { nativeAppVersion: '2.3', nativeBuildVersion: '21' } }));
jest.mock('@/hooks/use-theme-color', () => ({ useThemeColor: () => 'gray' }));
jest.mock('@/components/settings/SettingsPage', () => ({
  SettingsPage: ({ title, children }: { title: string; children: React.ReactNode }) => { const { View, Text } = jest.requireActual('react-native'); return <View><Text>{title}</Text>{children}</View>; },
}));
beforeEach(() => { jest.clearAllMocks(); });
afterEach(() => { jest.restoreAllMocks(); });
it('empty or whitespace-only messages cannot share and do not guard removal', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
  await render(<SupportComposer category="report" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Share report', disabled: true }));
  await fireEvent.changeText(screen.getByLabelText('Your message (required)'), ' \n ');
  expect(screen.getByRole('button', { name: 'Share report', disabled: true })).toBeTruthy();
  expect(mockGuard.mock.calls.at(-1)?.[0]).toBe(false);
  expect(share).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Cancel'));
  expect(router.back).toHaveBeenCalledTimes(1);
});
it.each([Share.dismissedAction, Share.sharedAction])('preserves draft after share result %s without delivery claims', async action => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action });
  await render(<SupportComposer category="feedback" />);
  await fireEvent.changeText(screen.getByLabelText('Your message (required)'), 'Clearer labels');
  await fireEvent.press(screen.getByRole('button', { name: 'Share feedback' }));
  await waitFor(() => expect(share).toHaveBeenCalledWith({ message: 'BinoFit feedback\n\nClearer labels\n\nApp version: 2.3\nBuild: 21' }));
  expect(screen.getByDisplayValue('Clearer labels')).toBeTruthy();
  expect(mockGuard.mock.calls.at(-1)?.[0]).toBe(true);
  expect(screen.queryByText(/Submitted|Delivered|Message sent/)).toBeNull();
  expect(router.back).not.toHaveBeenCalled();
});
it('disables duplicate share actions while pending and preserves a failed draft for retry', async () => {
  let reject!: (error: Error) => void;
  const share = jest.spyOn(Share, 'share').mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; })).mockResolvedValue({ action: Share.sharedAction });
  await render(<SupportComposer category="report" />);
  await fireEvent.changeText(screen.getByLabelText('Your message (required)'), 'Scan fails');
  await fireEvent.press(screen.getByRole('button', { name: 'Share report' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Share report', disabled: true }));
  expect(share).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Your message (required)').props.editable).toBe(false);
  await act(async () => { reject(new Error('unavailable')); });
  await screen.findByText('Could not open sharing. Your draft is still here. Try again.');
  expect(screen.getByDisplayValue('Scan fails')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Share report' }));
  await waitFor(() => expect(share).toHaveBeenCalledTimes(2));
  expect(share.mock.calls[0][0]).toEqual(share.mock.calls[1][0]);
});
it('guards dirty removal, keeps editing and dispatches the original discard action', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  await render(<SupportComposer category="report" />);
  await fireEvent.changeText(screen.getByLabelText('Your message (required)'), 'Unfinished report');
  await fireEvent.press(screen.getByText('Cancel'));
  expect(router.back).toHaveBeenCalledTimes(1);
  const action = { type: 'GO_BACK' };
  await act(async () => { mockGuard.mock.calls.at(-1)?.[1]({ data: { action } }); });
  const buttons = alert.mock.calls.at(-1)?.[2];
  expect(buttons?.find(button => button.text === 'Keep editing')?.style).toBe('cancel');
  expect(mockDispatch).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue('Unfinished report')).toBeTruthy();
  await act(async () => { buttons?.find(button => button.text === 'Discard')?.onPress?.(); });
  expect(mockDispatch).toHaveBeenCalledWith(action);
});
it('privacy exposes factual sections and the deletion receipt, with no fabricated contact', async () => {
  await render(<PrivacyPolicySettings />);
  for (const heading of ['On this device', 'Cloud and accounts', 'Apple Health', 'Exports and reports', 'Account deletion']) expect(screen.getByRole('header', { name: heading })).toBeTruthy();
  expect(screen.getByText(/minimal user-id and timestamp receipt/)).toBeTruthy();
  expect(screen.queryByText(/@|mailto:/)).toBeNull();
});
it('terms prominently marks the text as a draft for owner review', async () => {
  await render(<TermsSettings />);
  expect(screen.getByRole('header', { name: 'Draft for owner review' })).toBeTruthy();
  expect(screen.getByText(/needs final owner review/)).toBeTruthy();
});
