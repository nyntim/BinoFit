import { ActivityIndicator, Image, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { IconTile } from '@/components/ui/IconTile';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ListGroup, ListRow } from '@/components/ui/ListGroup';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';

type Props = {
  email: string | null;
  busy: boolean;
  /** Progress line shown while restoring. */
  statusText: string;
  /** Error shown after a failed attempt. */
  message: string | null;
  onRestore: () => void;
};

/** Restore screen shown when a signed-in install still has a backup to bring back. */
export function RestoreBackup({ email, busy, statusText, message, onRestore }: Props) {
  const background = useThemeColor({}, 'background');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'onTint');
  const icon = useThemeColor({}, 'icon');
  const danger = useThemeColor({}, 'danger');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        <View style={styles.hero}>
          <View style={styles.dinoWrap} accessible={false}>
            <Image source={require('@/assets/images/icon.png')} style={styles.dino} accessible={false} />
            <View style={[styles.badge, { backgroundColor: tint, borderColor: background }]}>
              <IconSymbol name="arrow.clockwise" size={18} color={onTint} />
            </View>
          </View>
          <ThemedText type="heading" accessibilityRole="header" style={styles.center}>Welcome back</ThemedText>
          <ThemedText style={[styles.center, styles.body, { color: icon }]}>
            {email ? `We found a backup for ${email}. Bring it onto this phone?` : 'We found a backup for your account. Bring it onto this phone?'}
          </ThemedText>
        </View>

        <ListGroup>
          <ListRow title="Food logs" leading={<IconTile icon="fork.knife" tone="neutral" size={32} />} />
          <ListRow title="Workouts and routines" leading={<IconTile icon="dumbbell.fill" tone="neutral" size={32} />} />
          <ListRow title="Weight entries" leading={<IconTile icon="chart.bar.fill" tone="neutral" size={32} />} />
        </ListGroup>

        <View style={styles.spacer} />

        <View style={styles.actions}>
          <Button label="Restore data" size="lg" onPress={onRestore} disabled={busy} />
          {busy && (
            <View style={styles.status} accessibilityLiveRegion="polite">
              <ActivityIndicator color={tint} />
              <ThemedText type="label" style={{ color: icon }}>{statusText}</ThemedText>
            </View>
          )}
          {!busy && message && (
            <ThemedText type="label" style={[styles.center, { color: danger }]} accessibilityLiveRegion="polite">
              {message}
            </ThemedText>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 32, paddingBottom: 24, gap: 24 },
  hero: { alignItems: 'center', gap: 14 },
  dinoWrap: { width: 104, height: 104 },
  dino: { width: 104, height: 104 },
  badge: { position: 'absolute', right: -6, bottom: -6, width: 34, height: 34, borderRadius: 17, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  body: { fontSize: 17, lineHeight: 24 },
  spacer: { flex: 1 },
  actions: { gap: 10 },
  status: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
