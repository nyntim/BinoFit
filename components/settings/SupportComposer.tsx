import { useRef, useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { TextField } from '@/components/ui/TextField';
import { useThemeColor } from '@/hooks/use-theme-color';
import { appInfo, supportMessage, type SupportCategory } from '@/lib/app-info';

export function SupportComposer({ category }: { category: SupportCategory }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sharing = useRef(false);
  const navigation = useNavigation();
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const panel = useThemeColor({}, 'cardSecondary');
  const danger = useThemeColor({}, 'danger');
  const info = appInfo(Constants);
  const report = category === 'report';
  const title = report ? 'Report a problem' : 'Send feedback';
  const action = report ? 'Share report' : 'Share feedback';
  const dirty = message.trim().length > 0;

  usePreventRemove(dirty, ({ data }) => {
    Alert.alert('Discard draft?', 'Your message has not been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  async function share() {
    if (!dirty || sharing.current) return;
    sharing.current = true;
    setBusy(true);
    setError(null);
    try { await Share.share({ message: supportMessage(category, message, info) }); }
    catch { setError('Could not open sharing. Your draft is still here. Try again.'); }
    finally { sharing.current = false; setBusy(false); }
  }

  return <SettingsPage title={title}>
    <ThemedText type="body" style={{ color: muted }}>{report ? 'Describe what happened and the steps to reproduce it.' : 'Describe what could improve.'}</ThemedText>
    <TextField label="Your message" accessibilityLabel="Your message (required)" multiline textAlignVertical="top" value={message} editable={!busy}
      onChangeText={value => { setMessage(value); setError(null); }}
      style={styles.input} />
    <ThemedText type="caption" style={styles.caption}>Your draft stays here until you leave this screen.</ThemedText>
    <View style={[styles.info, { backgroundColor: panel }]}>
      <IconSymbol name="info.circle" size={18} color={muted} />
      <View style={styles.infoCopy}>
        <Text style={[styles.infoText, { color: text }]}>Only your message, app version and build are included. No logs or diagnostics are attached automatically.</Text>
        <ThemedText type="caption" style={styles.tabular}>{`Version ${info.version} · Build ${info.build}`}</ThemedText>
      </View>
    </View>
    <ThemedText type="body">Choose an app or destination to share this message. Nothing is sent automatically.</ThemedText>
    {error ? <Text accessibilityRole="alert" style={[styles.body, { color: danger }]}>{error}</Text> : null}
    <Button size="lg" label={action} loading={busy} disabled={!dirty || busy} onPress={() => { void share(); }} />
    <Button variant="ghost" label="Cancel" fullWidth onPress={() => router.back()} />
  </SettingsPage>;
}
const styles = StyleSheet.create({
  body: { fontSize: 15, lineHeight: 22 },
  input: { minHeight: 160, paddingTop: 12, lineHeight: 22, textAlignVertical: 'top' },
  caption: { paddingHorizontal: 4 },
  info: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
  infoCopy: { flex: 1, gap: 4 },
  infoText: { fontSize: 13, lineHeight: 18 },
  tabular: { fontVariant: ['tabular-nums'] },
});
