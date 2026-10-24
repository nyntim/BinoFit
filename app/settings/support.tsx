import { Pressable, StyleSheet, View } from 'react-native';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { failureText, useDestination } from '@/components/settings/DestinationRow';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/Card';
import { IconTile, type IconTileTone } from '@/components/ui/IconTile';
import type { IconSymbolName } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';

function DestinationCard({ label, caption, icon, tone, open, external }: { label: string; caption: string; icon: IconSymbolName; tone: IconTileTone; open: () => void; external: boolean }) {
  return (
    <Pressable
      accessibilityRole={external ? 'link' : 'button'}
      accessibilityLabel={`${label}, ${caption}`}
      onPress={open}
      style={({ pressed }) => [styles.cardWrap, pressed && styles.pressed]}
    >
      <Card style={styles.destination}>
        <IconTile icon={icon} tone={tone} size={40} />
        <View style={styles.destinationCopy}>
          <ThemedText type="title">{label}</ThemedText>
          <ThemedText type="caption">{caption}</ThemedText>
        </View>
      </Card>
    </Pressable>
  );
}

export default function SupportSettings() {
  const muted = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const danger = useThemeColor({}, 'danger');
  const report = useDestination('support', 'Report a problem');
  const feedback = useDestination('feedback', 'Send feedback');
  const failure = report.failed ? failureText('Report a problem') : feedback.failed ? failureText('Send feedback') : null;
  return <SettingsPage title="Support">
    <ThemedText type="body" style={{ color: muted }}>Tell us what&apos;s working and what isn&apos;t.</ThemedText>
    <View style={styles.cards}>
      <DestinationCard label="Report a problem" caption="Something broke or looks wrong" icon="exclamationmark.circle" tone="neutral" open={report.open} external={report.external} />
      <DestinationCard label="Send feedback" caption="Ideas, wishes, what you love" icon="lightbulb" tone="tint" open={feedback.open} external={feedback.external} />
    </View>
    {failure ? <ThemedText type="caption" accessibilityLiveRegion="polite" style={{ color: danger, fontSize: 13 }}>{failure}</ThemedText> : null}
    <Card style={styles.include}>
      <ThemedText type="label" style={styles.semibold}>What to include</ThemedText>
      {['What you were doing when it happened', 'What you expected to see', 'The food or exercise name, if it matters'].map(item => (
        <View key={item} style={styles.bullet}>
          <View style={[styles.dot, { backgroundColor: tint }]} />
          <ThemedText type="body" style={styles.bulletText}>{item}</ThemedText>
        </View>
      ))}
      <ThemedText type="caption">Your message includes the app version and build. Reports do not automatically attach your food, weight, account or training data.</ThemedText>
    </Card>
  </SettingsPage>;
}

const styles = StyleSheet.create({
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cardWrap: { flexGrow: 1, flexBasis: '48%', minWidth: 150 },
  pressed: { opacity: 0.85 },
  destination: { gap: 12, paddingVertical: 18, paddingHorizontal: 16, minHeight: 132 },
  destinationCopy: { gap: 2 },
  include: { gap: 8 },
  semibold: { fontWeight: '600' },
  bullet: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  bulletText: { flex: 1 },
});
