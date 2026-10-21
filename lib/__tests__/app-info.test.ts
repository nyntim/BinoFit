import { appInfo, supportMessage } from '@/lib/app-info';
it('prefers runtime version and build over Expo and platform fallbacks', () => {
  expect(appInfo({ nativeAppVersion: '2.3', nativeBuildVersion: '21', expoConfig: { version: '1.0' }, platform: { ios: { buildNumber: '9' } } })).toEqual({ version: '2.3', build: '21' });
});
it('uses Expo version, native platform build and truthful absent values', () => {
  expect(appInfo({ expoConfig: { version: '2.1' }, platform: { ios: { buildNumber: '12' } } })).toEqual({ version: '2.1', build: '12' });
  expect(appInfo({ platform: { android: { versionCode: 5 } } })).toEqual({ version: 'Unavailable', build: '5' });
  expect(appInfo({})).toEqual({ version: 'Unavailable', build: 'Unavailable' });
});
it('includes only category, authored text and displayed metadata in the share message', () => {
  expect(supportMessage('report', '  Barcode scan fails\nAfter tapping Scan  ', { version: '2.3', build: '21' })).toBe('BinoFit problem report\n\nBarcode scan fails\nAfter tapping Scan\n\nApp version: 2.3\nBuild: 21');
  expect(supportMessage('feedback', 'Larger labels', { version: 'Unavailable', build: 'Unavailable' })).toBe('BinoFit feedback\n\nLarger labels\n\nApp version: Unavailable\nBuild: Unavailable');
});
