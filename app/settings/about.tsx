import Constants from 'expo-constants';
import { SettingsPage, SettingsRow } from '@/components/settings/SettingsPage';
import { DestinationRow } from '@/components/settings/DestinationRow';

export default function AboutSettings() {
  return <SettingsPage title="About">
    <SettingsRow label="BinoFit" description="Nutrition and training tracking." />
    <SettingsRow label="Version" value={Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? 'Unavailable'} />
    <SettingsRow label="Build" value={Constants.nativeBuildVersion ?? Constants.platform?.ios?.buildNumber ?? Constants.platform?.android?.versionCode?.toString() ?? 'Unavailable'} />
    <DestinationRow label="Privacy Policy" destination="privacy" />
    <DestinationRow label="Terms of Service" destination="terms" />
  </SettingsPage>;
}
