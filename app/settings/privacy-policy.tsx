import { SettingsPage } from '@/components/settings/SettingsPage';
import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';

export default function PrivacyPolicySettings() {
  return <SettingsPage title="Privacy policy">
    <ThemedText type="body">This overview describes how BinoFit stores and shares your tracking data.</ThemedText>
    <View style={styles.section}>
      <ThemedText type="title" accessibilityRole="header">On this device</ThemedText>
      <ThemedText type="body">Food and weight logs, meals and training records are saved locally. Goals, profile and preferences are saved on this device too. Water logs, meal Eaten/Planned confirmations, quick-add drinks, display and training preferences, active workouts, drafts and the Spotify connection stay on this device.</ThemedText>
    </View>
    <View style={styles.section}>
      <ThemedText type="title" accessibilityRole="header">Cloud and accounts</ThemedText>
      <ThemedText type="body">When available, cloud sync can back up food logs, custom foods, goals, profile, meals, weight history, finished workouts, custom exercises and routines. An anonymous session identifies this installation. Signing in provides an account for recovery on another device. Recent edits and deletions can remain unsynced; local records may differ from the cloud until sync succeeds.</ThemedText>
    </View>
    <View style={styles.section}>
      <ThemedText type="title" accessibilityRole="header">Food data</ThemedText>
      <ThemedText type="body">Food data comes from USDA FoodData Central and Open Food Facts. Remote food searches send the search text to the cloud catalog. When a barcode is not saved locally, its number is sent to Open Food Facts to look up the product.</ThemedText>
    </View>
    <View style={styles.section}>
      <ThemedText type="title" accessibilityRole="header">Apple Health</ThemedText>
      <ThemedText type="body">On supported iOS devices, optional Apple Health access reads weight, steps and active energy, and writes weight, nutrition and finished workouts. Read and write access are controlled separately in Apple Health and device Settings. Records already saved in Apple Health are managed there separately.</ThemedText>
    </View>
    <View style={styles.section}>
      <ThemedText type="title" accessibilityRole="header">Spotify</ThemedText>
      <ThemedText type="body">If you connect Spotify, BinoFit reads what is playing while a live workout screen is open, and at Finish. It saves the playlist name and id with the finished workout, and they sync and restore with your workouts. It does not read your listening history and never controls playback. Spotify sign-in tokens stay in this device’s secure storage, are never synced, and are removed when you disconnect, sign out or delete your account. Remove BinoFit from your Spotify account’s Apps page to revoke access at Spotify.</ThemedText>
    </View>
    <View style={styles.section}>
      <ThemedText type="title" accessibilityRole="header">Exports and reports</ThemedText>
      <ThemedText type="body">Exports contain saved local records in the dataset and date range you choose. Reports and feedback share only the text you enter, app version and build through a destination you select. No logs or diagnostics are attached automatically. The receiving app or destination handles what you choose to share.</ThemedText>
    </View>
    <View style={styles.section}>
      <ThemedText type="title" accessibilityRole="header">Account deletion</ThemedText>
      <ThemedText type="body">Confirmed account deletion permanently removes the account and its cloud tracking data, then clears this device’s account data. A minimal user-id and timestamp receipt remains for deletion recovery. Data already exported or shared, and records in Apple Health, are managed separately. Check pending sync changes and export any records you want to keep before deleting.</ThemedText>
    </View>
  </SettingsPage>;
}

const styles = StyleSheet.create({ section: { gap: 6, maxWidth: 520 } });
