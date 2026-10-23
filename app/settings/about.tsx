import { useState } from 'react';
import { Linking } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import Constants from 'expo-constants';
import { appInfo } from '@/lib/app-info';
import { SettingsPage, SettingsRow } from '@/components/settings/SettingsPage';
import { DestinationRow } from '@/components/settings/DestinationRow';

export default function AboutSettings() {
  const [failedLink, setFailedLink] = useState<string | null>(null);
  const openSource = (label: string, url: string) => {
    setFailedLink(null);
    void Linking.openURL(url).catch(() => setFailedLink(label));
  };
  const { version, build } = appInfo(Constants);
  return <SettingsPage title="About">
    <SettingsRow label="BinoFit" description="Nutrition and training tracking." />
    <SettingsRow label="Version" value={version} />
    <SettingsRow label="Build" value={build} />
    <ThemedText accessibilityRole="header" type="defaultSemiBold">Data sources</ThemedText>
    <SettingsRow label="Open Food Facts" description="Food data from Open Food Facts (openfoodfacts.org), available under the Open Database License (ODbL)." accessibilityRole="link" onPress={() => openSource('Open Food Facts', 'https://world.openfoodfacts.org/')} />
    <SettingsRow label="Open Database License (ODbL)" description="Read the data license." accessibilityRole="link" onPress={() => openSource('Open Database License', 'https://opendatacommons.org/licenses/odbl/1-0/')} />
    <SettingsRow label="USDA FoodData Central" description="SR Legacy and Foundation food data." accessibilityRole="link" onPress={() => openSource('USDA FoodData Central', 'https://fdc.nal.usda.gov/')} />
    {failedLink && <ThemedText>Could not open {failedLink}. Try again.</ThemedText>}
    <DestinationRow label="Privacy Policy" destination="privacy" />
    <DestinationRow label="Terms of Service" destination="terms" />
  </SettingsPage>;
}
