import { SettingsPage } from '@/components/settings/SettingsPage';
import { ThemedText } from '@/components/themed-text';

export default function PrivacyPolicySettings() {
  return <SettingsPage title="Privacy Policy">
    <ThemedText>This overview describes how BinoFit stores and shares your tracking data.</ThemedText>
    <ThemedText accessibilityRole="header" type="defaultSemiBold">On this device</ThemedText>
    <ThemedText>Food and weight logs, meals and training records are saved locally. Goals, profile and preferences are saved on this device too. Water logs, meal Eaten/Planned confirmations, quick-add drinks, display and training preferences, active workouts, drafts and the Spotify connection stay on this device.</ThemedText>
    <ThemedText accessibilityRole="header" type="defaultSemiBold">Cloud and accounts</ThemedText>
    <ThemedText>When available, cloud sync can back up food logs, custom foods, goals, profile, meals, weight history, finished workouts, custom exercises and routines. An anonymous session identifies this installation. Signing in provides an account for recovery on another device. Recent edits and deletions can remain unsynced; local records may differ from the cloud until sync succeeds.</ThemedText>
    <ThemedText accessibilityRole="header" type="defaultSemiBold">Apple Health</ThemedText>
    <ThemedText>On supported iOS devices, optional Apple Health access reads weight, steps and active energy, and writes weight, nutrition and finished workouts. Read and write access are controlled separately in Apple Health and device Settings. Records already saved in Apple Health are managed there separately.</ThemedText>
    <ThemedText accessibilityRole="header" type="defaultSemiBold">Spotify</ThemedText>
    <ThemedText>If you connect Spotify, BinoFit reads what is playing while a live workout screen is open, and at Finish. It saves the playlist name and id with the finished workout, and they sync and restore with your workouts. It does not read your listening history and never controls playback. Spotify sign-in tokens stay in this device’s secure storage, are never synced, and are removed when you disconnect, sign out or delete your account. Remove BinoFit from your Spotify account’s Apps page to revoke access at Spotify.</ThemedText>
    <ThemedText accessibilityRole="header" type="defaultSemiBold">Exports and reports</ThemedText>
    <ThemedText>Exports contain saved local records in the dataset and date range you choose. Reports and feedback share only the text you enter, app version and build through a destination you select. No logs or diagnostics are attached automatically. The receiving app or destination handles what you choose to share.</ThemedText>
    <ThemedText accessibilityRole="header" type="defaultSemiBold">Account deletion</ThemedText>
    <ThemedText>Confirmed account deletion permanently removes the account and its cloud tracking data, then clears this device’s account data. A minimal user-id and timestamp receipt remains for deletion recovery. Data already exported or shared, and records in Apple Health, are managed separately. Check pending sync changes and export any records you want to keep before deleting.</ThemedText>
  </SettingsPage>;
}
