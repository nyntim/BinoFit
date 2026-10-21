import { AccountSection } from '@/components/settings/AccountSection';
import { SettingsPage } from '@/components/settings/SettingsPage';

export default function AccountSettings() {
  return <SettingsPage title="Account"><AccountSection showTitle={false} /></SettingsPage>;
}
