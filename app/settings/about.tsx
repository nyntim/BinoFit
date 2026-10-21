import Constants from 'expo-constants';
import { appInfo } from '@/lib/app-info';
import { SettingsPage, SettingsRow } from '@/components/settings/SettingsPage';
import { DestinationRow } from '@/components/settings/DestinationRow';

export default function AboutSettings() {
  const { version, build } = appInfo(Constants);
  return <SettingsPage title="About">
    <SettingsRow label="BinoFit" description="Nutrition and training tracking." />
    <SettingsRow label="Version" value={version} />
    <SettingsRow label="Build" value={build} />
    <DestinationRow label="Privacy Policy" destination="privacy" />
    <DestinationRow label="Terms of Service" destination="terms" />
  </SettingsPage>;
}
