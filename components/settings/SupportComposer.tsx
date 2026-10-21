import { useRef, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, TextInput } from 'react-native';
import Constants from 'expo-constants';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { SettingsPage, SettingsRow } from '@/components/settings/SettingsPage';
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
  const tint = useThemeColor({}, 'tint');
  const card = useThemeColor({}, 'cardBackground');
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
    <Text style={[styles.body, { color: muted }]}>{report ? 'Describe what happened and the steps to reproduce it.' : 'Describe what could improve.'}</Text>
    <Text style={[styles.label, { color: text }]}>Message (required)</Text>
    <TextInput accessibilityLabel="Message (required)" multiline textAlignVertical="top" value={message} editable={!busy}
      onChangeText={value => { setMessage(value); setError(null); }}
      style={[styles.input, { color: text, backgroundColor: card }]} />
    <Text style={[styles.body, { color: muted }]}>Your draft stays here until you leave this screen.</Text>
    <SettingsRow label="App version" value={info.version} />
    <SettingsRow label="Build" value={info.build} />
    <Text style={[styles.body, { color: text }]}>Choose an app or destination to share this message. Nothing is sent automatically.</Text>
    <Text style={[styles.body, { color: muted }]}>Only your message, app version and build are included. No logs or diagnostics are attached automatically.</Text>
    {error ? <Text accessibilityRole="alert" style={[styles.body, { color: danger }]}>{error}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={action} accessibilityState={{ disabled: !dirty || busy, busy }} disabled={!dirty || busy} onPress={() => { void share(); }} style={[styles.button, { opacity: !dirty || busy ? 0.5 : 1 }]}>
      <Text style={[styles.label, { color: tint }]}>{busy ? 'Opening share sheet…' : action}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.button}><Text style={[styles.label, { color: tint }]}>Cancel</Text></Pressable>
  </SettingsPage>;
}
const styles = StyleSheet.create({ body: { fontSize: 15, lineHeight: 22 }, label: { fontSize: 15, fontWeight: '500' }, input: { minHeight: 160, padding: 16, borderRadius: 8, fontSize: 15, lineHeight: 22 }, button: { minHeight: 44, justifyContent: 'center' } });
