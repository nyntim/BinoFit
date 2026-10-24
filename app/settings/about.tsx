import { useState } from 'react';
import { Image, Linking, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { ListGroup, ListRow } from '@/components/ui/ListGroup';
import { appInfo } from '@/lib/app-info';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { DestinationRow } from '@/components/settings/DestinationRow';
import { useThemeColor } from '@/hooks/use-theme-color';

const dinosaur = require('@/assets/images/icon.png');

export default function AboutSettings() {
  const [failedLink, setFailedLink] = useState<string | null>(null);
  const muted = useThemeColor({}, 'icon');
  const openSource = (label: string, url: string) => {
    setFailedLink(null);
    void Linking.openURL(url).catch(() => setFailedLink(label));
  };
  const { version, build } = appInfo(Constants);
  return <SettingsPage title="About">
    <View style={styles.hero}>
      <Image source={dinosaur} style={styles.icon} accessible accessibilityRole="image" accessibilityLabel="BinoFit app icon" accessibilityIgnoresInvertColors />
      <ThemedText type="heading">BinoFit</ThemedText>
      <ThemedText type="body" style={{ color: muted }}>Nutrition and training tracking.</ThemedText>
      <ThemedText type="caption" style={styles.tabular}>{`Version ${version} · Build ${build}`}</ThemedText>
    </View>
    <ThemedText type="section" accessibilityRole="header">Food data</ThemedText>
    <ListGroup>
      <ListRow title="USDA FoodData Central" subtitle="SR Legacy and Foundation food data." accessibilityRole="link" onPress={() => openSource('USDA FoodData Central', 'https://fdc.nal.usda.gov/')} />
      <View style={styles.source}>
        <ThemedText type="title">Open Food Facts</ThemedText>
        <ThemedText type="caption">Food data from Open Food Facts (openfoodfacts.org), available under the Open Database License (ODbL).</ThemedText>
        <View style={styles.buttons}>
          <Button variant="soft" size="sm" label="Visit source" accessibilityRole="link" accessibilityLabel="Visit Open Food Facts" onPress={() => openSource('Open Food Facts', 'https://world.openfoodfacts.org/')} />
          <Button variant="ghost" size="sm" label="Read the data license" accessibilityRole="link" accessibilityLabel="Read the Open Database License" onPress={() => openSource('Open Database License', 'https://opendatacommons.org/licenses/odbl/1-0/')} />
        </View>
      </View>
    </ListGroup>
    {failedLink && <ThemedText type="caption">Could not open {failedLink}. Try again.</ThemedText>}
    <ListGroup>
      <DestinationRow label="Privacy policy" destination="privacy" />
      <DestinationRow label="Terms of service" destination="terms" />
    </ListGroup>
  </SettingsPage>;
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 4, paddingVertical: 8 },
  icon: { width: 104, height: 104, borderRadius: 26, marginBottom: 8 },
  tabular: { fontVariant: ['tabular-nums'] },
  source: { paddingVertical: 12, paddingHorizontal: 16, gap: 6 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
