import { SettingsPage, SettingsRow } from '@/components/settings/SettingsPage';
import { DestinationRow } from '@/components/settings/DestinationRow';

export default function SupportSettings() {
  return <SettingsPage title="Support">
    <DestinationRow label="Report a problem" destination="support" />
    <DestinationRow label="Send feedback" destination="feedback" />
    <SettingsRow label="What to include" description="Describe what happened and the steps to reproduce it. You can include the app version and build shown in About. Reports do not automatically attach your food, weight, account or training data." />
  </SettingsPage>;
}
