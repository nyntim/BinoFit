import { SettingsPage } from '@/components/settings/SettingsPage';
import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';

export default function TermsSettings() {
  return <SettingsPage title="Terms of service">
    <View style={styles.section}>
      <ThemedText type="title" accessibilityRole="header">Draft for owner review</ThemedText>
      <ThemedText type="body">This is a draft. It needs final owner review before it can serve as the app’s final terms.</ThemedText>
    </View>
    <View style={styles.section}>
      <ThemedText type="title" accessibilityRole="header">Using BinoFit</ThemedText>
      <ThemedText type="body">BinoFit provides tools for recording nutrition, body weight and training. You choose what to enter and are responsible for checking your entries.</ThemedText>
    </View>
    <View style={styles.section}>
      <ThemedText type="title" accessibilityRole="header">Estimates and food sources</ThemedText>
      <ThemedText type="body">Nutrition values, serving conversions and training estimates can be incomplete or inaccurate. Food-source data may differ from product labels. Food data includes Open Food Facts, available under the Open Database License (ODbL), and USDA FoodData Central. Source and license links are in About. Check the source and serving amount when accuracy matters.</ThemedText>
    </View>
    <View style={styles.section}>
      <ThemedText type="title" accessibilityRole="header">Optional services</ThemedText>
      <ThemedText type="body">Cloud sync and Apple Health depend on service availability, a compatible device and the access you allow. Changes may remain only on this device until synchronization succeeds.</ThemedText>
    </View>
    <View style={styles.section}>
      <ThemedText type="title" accessibilityRole="header">Your data controls</ThemedText>
      <ThemedText type="body">You can export saved local records, manage integration access and delete a signed-in account through Settings. A CSV export is not a restorable account backup. Review the Privacy Policy and account deletion details before removing data.</ThemedText>
    </View>
  </SettingsPage>;
}

const styles = StyleSheet.create({ section: { gap: 6, maxWidth: 520 } });
