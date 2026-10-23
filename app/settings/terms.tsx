import { SettingsPage } from '@/components/settings/SettingsPage';
import { ThemedText } from '@/components/themed-text';

export default function TermsSettings() {
  return <SettingsPage title="Terms of Service">
    <ThemedText accessibilityRole="header" type="defaultSemiBold">Draft for owner review</ThemedText>
    <ThemedText>This is a draft. It needs final owner review before it can serve as the app’s final terms.</ThemedText>
    <ThemedText accessibilityRole="header" type="defaultSemiBold">Using BinoFit</ThemedText>
    <ThemedText>BinoFit provides tools for recording nutrition, body weight and training. You choose what to enter and are responsible for checking your entries.</ThemedText>
    <ThemedText accessibilityRole="header" type="defaultSemiBold">Estimates and food sources</ThemedText>
    <ThemedText>Nutrition values, serving conversions and training estimates can be incomplete or inaccurate. Food-source data may differ from product labels. Food data includes Open Food Facts, available under the Open Database License (ODbL), and USDA FoodData Central. Source and license links are in About. Check the source and serving amount when accuracy matters.</ThemedText>
    <ThemedText accessibilityRole="header" type="defaultSemiBold">Optional services</ThemedText>
    <ThemedText>Cloud sync and Apple Health depend on service availability, a compatible device and the access you allow. Changes may remain only on this device until synchronization succeeds.</ThemedText>
    <ThemedText accessibilityRole="header" type="defaultSemiBold">Your data controls</ThemedText>
    <ThemedText>You can export saved local records, manage integration access and delete a signed-in account through Settings. A CSV export is not a restorable account backup. Review the Privacy Policy and account deletion details before removing data.</ThemedText>
  </SettingsPage>;
}
