import { useEffect, useState } from 'react';
import { AccessibilityInfo, Linking, Text } from 'react-native';
import { router } from 'expo-router';
import { ListRow } from '@/components/ui/ListGroup';
import { useThemeColor } from '@/hooks/use-theme-color';
import { internalSettingsDestination, settingsDestination, type SettingsDestination } from '@/lib/settings-destinations';

/** Opens a configured URL, or the internal page when none is set. `failed` is true after a URL could not be opened. */
export function useDestination(destination: SettingsDestination, label: string) {
  const url = settingsDestination(destination);
  const [failed, setFailed] = useState(false);
  const open = () => {
    setFailed(false);
    if (url) void Linking.openURL(url).catch(() => setFailed(true));
    else router.push(internalSettingsDestination(destination));
  };
  useEffect(() => {
    if (failed) AccessibilityInfo.announceForAccessibility(failureText(label));
  }, [failed, label]);
  return { open, failed, external: !!url };
}

export const failureText = (label: string) => `Could not open ${label.toLowerCase()}. Try again.`;

/** A row of a `ListGroup` that opens a legal or support destination. */
export function DestinationRow({ label, destination, subtitle }: { label: string; destination: SettingsDestination; subtitle?: string }) {
  const { open, failed, external } = useDestination(destination, label);
  const danger = useThemeColor({}, 'danger');
  return (
    <ListRow title={label} subtitle={subtitle} onPress={open} accessibilityRole={external ? 'link' : 'button'}>
      {failed ? <Text accessibilityLiveRegion="polite" style={{ color: danger, fontSize: 13, paddingTop: 4 }}>{failureText(label)}</Text> : null}
    </ListRow>
  );
}
