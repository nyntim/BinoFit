import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { IconTile } from '@/components/ui/IconTile';
import { TextField } from '@/components/ui/TextField';
import { useThemeColor } from '@/hooks/use-theme-color';

export type MissPhase =
  | { kind: 'not_found'; code: string }
  | { kind: 'incomplete'; code: string; name: string | null; brand: string | null }
  | { kind: 'error'; code: string };

type Props = {
  phase: MissPhase;
  /** Look up the (possibly edited) digits. */
  onLookup: (code: string) => void;
  onCreate: (extra: { barcode: string; name?: string | null; brand?: string | null }) => void;
  onRescan: () => void;
  onSearch: () => void;
  /** Bottom inset to clear the home indicator. */
  bottomInset?: number;
};

const COPY = {
  not_found: { title: 'Not found yet', body: "Open Food Facts doesn't have this product. Add it once and it's saved for next time." },
  incomplete: { title: 'Missing nutrition', body: "Open Food Facts doesn't have complete nutrition for this product. Add it once and it's saved for next time." },
  error: { title: "Couldn't reach Open Food Facts.", body: 'Check your connection and try again.' },
} as const;

/** Bottom sheet over the dimmed camera when a scan finds no usable product. Themed like the rest of the app. */
export function ScanMissSheet({ phase, onLookup, onCreate, onRescan, onSearch, bottomInset = 0 }: Props) {
  const sheetBackground = useThemeColor({}, 'sheetBackground');
  const grabber = useThemeColor({}, 'fieldBorder');
  const muted = useThemeColor({}, 'icon');
  const [code, setCode] = useState(phase.code);
  const copy = COPY[phase.kind];
  const create = () => onCreate({
    barcode: phase.code,
    ...(phase.kind === 'incomplete' ? { name: phase.name, brand: phase.brand } : {}),
  });

  return (
    <View
      accessibilityViewIsModal
      accessibilityLabel="Barcode not found"
      style={[styles.sheet, { backgroundColor: sheetBackground, paddingBottom: 16 + bottomInset }]}
    >
      <View style={[styles.grabber, { backgroundColor: grabber }]} accessible={false} importantForAccessibility="no" />
      <View style={styles.head}>
        <IconTile icon={phase.kind === 'error' ? 'exclamationmark.circle' : 'magnifyingglass'} tone="neutral" size={52} />
        <View style={styles.copy} accessibilityLiveRegion="polite">
          <ThemedText type="title">{copy.title}</ThemedText>
          <ThemedText type="label" style={{ color: muted }}>{copy.body}</ThemedText>
        </View>
      </View>
      <TextField
        label="Barcode"
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        returnKeyType="search"
        onSubmitEditing={() => onLookup(code)}
      />
      {phase.kind === 'error' ? (
        <>
          <Button size="lg" label="Retry" onPress={() => onLookup(phase.code)} />
          <Button size="lg" variant="secondary" label="Create food with this barcode" onPress={create} />
        </>
      ) : (
        <Button size="lg" label="Create food with this barcode" onPress={create} />
      )}
      <View style={styles.row}>
        <Button size="lg" variant="secondary" fullWidth={false} style={styles.half} label="Scan again" onPress={onRescan} />
        <Button size="lg" variant="secondary" fullWidth={false} style={styles.half} label="Search by name" onPress={onSearch} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 8, gap: 12 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
});
