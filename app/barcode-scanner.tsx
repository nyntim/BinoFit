import { useEffect, useRef, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Linking,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { lookupBarcode } from '@/lib/food-service';

type Phase =
  | { kind: 'scanning' }
  | { kind: 'looking' }
  | { kind: 'invalid' }
  | { kind: 'not_found'; code: string }
  | { kind: 'incomplete'; code: string; name: string | null; brand: string | null }
  | { kind: 'error'; code: string };

const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;

function Button({
  label,
  onPress,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  const background = useThemeColor({}, 'background');
  const tint = useThemeColor({}, 'tint');
  const separator = useThemeColor({}, 'separator');
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      style={[
        styles.button,
        primary
          ? { backgroundColor: tint }
          : { backgroundColor: 'transparent', borderWidth: 1, borderColor: separator },
      ]}
    >
      <ThemedText style={[styles.buttonText, { color: primary ? background : tint }]} type="defaultSemiBold">
        {label}
      </ThemedText>
    </TouchableOpacity>
  );
}

export default function BarcodeScannerScreen() {
  const { meal_slot, date } = useLocalSearchParams<{ meal_slot: string; date: string }>();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  // Explicit insets: SafeAreaView can report zero inside a native fullScreenModal,
  // which put the header under the notch / status bar.
  const insets = useSafeAreaInsets();

  const background = useThemeColor({}, 'background');
  const card = useThemeColor({}, 'cardBackground');
  const cardSecondary = useThemeColor({}, 'cardSecondary');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const separator = useThemeColor({}, 'separator');
  const fieldBorder = useThemeColor({}, 'fieldBorder');

  const [phase, setPhase] = useState<Phase>({ kind: 'scanning' });
  const [torch, setTorch] = useState(false);
  const [manual, setManual] = useState(false);
  const [manualCode, setManualCode] = useState('');
  // Synchronous guard: onBarcodeScanned can fire several times before state updates land
  const lockRef = useRef(false);
  // False once the screen unmounts or navigates away, so a late lookup result is dropped
  const activeRef = useRef(true);
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const locked = phase.kind !== 'scanning';

  const goToSearch = () => {
    activeRef.current = false;
    router.replace({ pathname: '/food-search' as any, params: { meal_slot, date } });
  };

  const goToCreate = (extra: { barcode?: string; name?: string | null; brand?: string | null }) => {
    activeRef.current = false;
    router.replace({
      pathname: '/custom-food' as any,
      params: {
        meal_slot,
        date,
        ...(extra.barcode ? { barcode: extra.barcode } : {}),
        ...(extra.name ? { name: extra.name } : {}),
        ...(extra.brand ? { brand: extra.brand } : {}),
      },
    });
  };

  const runLookup = async (raw: string) => {
    lockRef.current = true;
    setPhase({ kind: 'looking' });
    const result = await lookupBarcode(raw);
    if (!activeRef.current) return;
    if (result.status === 'found') {
      activeRef.current = false;
      router.replace({
        pathname: '/serving-picker' as any,
        params: { food_id: result.food.id, meal_slot, date },
      });
      return;
    }
    if (result.status === 'invalid') setPhase({ kind: 'invalid' });
    else if (result.status === 'not_found') setPhase({ kind: 'not_found', code: result.code });
    else if (result.status === 'incomplete')
      setPhase({ kind: 'incomplete', code: result.code, name: result.name, brand: result.brand });
    else setPhase({ kind: 'error', code: result.code });
  };

  const onScanned = ({ data }: { data: string }) => {
    if (lockRef.current) return;
    lockRef.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    runLookup(data);
  };

  const rescan = () => {
    lockRef.current = false;
    setPhase({ kind: 'scanning' });
  };

  const submitManual = () => {
    if (lockRef.current && phase.kind === 'looking') return;
    runLookup(manualCode);
  };

  // ---------- Pieces ----------

  const manualEntry = (
    <View style={styles.manualRow}>
      <TextInput
        style={[styles.manualInput, { color: text, backgroundColor: cardSecondary, borderColor: fieldBorder }]}
        value={manualCode}
        onChangeText={setManualCode}
        placeholder="Barcode digits"
        placeholderTextColor={muted}
        keyboardType="number-pad"
        returnKeyType="search"
        onSubmitEditing={submitManual}
        accessibilityLabel="Barcode digits"
        autoFocus
      />
      <TouchableOpacity
        onPress={submitManual}
        disabled={manualCode.replace(/\D/g, '').length === 0}
        style={[
          styles.lookupBtn,
          { backgroundColor: tint, opacity: manualCode.replace(/\D/g, '').length === 0 ? 0.4 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Look up barcode"
        accessibilityState={{ disabled: manualCode.replace(/\D/g, '').length === 0 }}
      >
        <ThemedText style={{ color: background }} type="defaultSemiBold">
          Look up
        </ThemedText>
      </TouchableOpacity>
    </View>
  );

  const manualBlock = manual ? (
    manualEntry
  ) : (
    <Button label="Enter barcode manually" onPress={() => setManual(true)} />
  );

  const secondaryActions = (
    <>
      {!manual && <Button label="Enter barcode manually" onPress={() => setManual(true)} />}
      <Button label="Search by name" onPress={goToSearch} />
    </>
  );

  let panel: React.ReactNode;
  if (phase.kind === 'looking') {
    panel = (
      <View style={styles.statusRow}>
        <ActivityIndicator color={tint} />
        <ThemedText style={{ color: muted }} accessibilityLiveRegion="polite">Looking up product…</ThemedText>
      </View>
    );
  } else if (phase.kind === 'not_found') {
    panel = (
      <>
        <ThemedText accessibilityLiveRegion="polite">{`No product found for ${phase.code}.`}</ThemedText>
        <Button label="Create food" primary onPress={() => goToCreate({ barcode: phase.code })} />
        <Button label="Search by name" onPress={goToSearch} />
        <Button label="Scan again" onPress={rescan} />
        {manualBlock}
      </>
    );
  } else if (phase.kind === 'incomplete') {
    panel = (
      <>
        <ThemedText accessibilityLiveRegion="polite">Open Food Facts doesn&apos;t have complete nutrition for {phase.code}.</ThemedText>
        <Button
          label="Create food"
          primary
          onPress={() => goToCreate({ barcode: phase.code, name: phase.name, brand: phase.brand })}
        />
        <Button label="Search by name" onPress={goToSearch} />
        <Button label="Scan again" onPress={rescan} />
        {manualBlock}
      </>
    );
  } else if (phase.kind === 'error') {
    panel = (
      <>
        <ThemedText accessibilityLiveRegion="polite">Couldn&apos;t reach Open Food Facts.</ThemedText>
        <Button label="Retry" primary onPress={() => runLookup(phase.code)} />
        <Button label="Search by name" onPress={goToSearch} />
        <Button label="Create food" onPress={() => goToCreate({ barcode: phase.code })} />
        <Button label="Scan again" onPress={rescan} />
        {manualBlock}
      </>
    );
  } else if (phase.kind === 'invalid') {
    panel = (
      <>
        <ThemedText accessibilityLiveRegion="polite">That isn&apos;t a valid barcode. Use 8, 12, 13 or 14 digits.</ThemedText>
        <Button label="Scan again" primary onPress={rescan} />
        {secondaryActions}
        {manual && manualEntry}
      </>
    );
  } else if (!permission?.granted) {
    panel = null; // handled below
  } else {
    panel = (
      <>
        <ThemedText style={{ color: muted }}>Point the camera at a barcode.</ThemedText>
        {manual && manualEntry}
        {secondaryActions}
      </>
    );
  }

  // ---------- Permission states ----------

  let body: React.ReactNode;
  if (!permission) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={tint} />
      </View>
    );
  } else if (!permission.granted) {
    const canAsk = permission.canAskAgain;
    body = (
      <ScrollView
        contentContainerStyle={styles.centerScroll}
        keyboardShouldPersistTaps="handled"
      >
        <ThemedText style={styles.centerText}>
          {canAsk ? 'Camera access is needed to scan barcodes.' : 'Camera access is off for BinoFit.'}
        </ThemedText>
        {canAsk ? (
          <Button label="Allow camera" primary onPress={() => requestPermission()} />
        ) : (
          <Button label="Open Settings" primary onPress={() => Linking.openSettings()} />
        )}
        {manual && manualEntry}
        {phase.kind === 'looking' && (
          <View style={styles.statusRow}>
            <ActivityIndicator color={tint} />
            <ThemedText style={{ color: muted }}>Looking up product…</ThemedText>
          </View>
        )}
        {phase.kind !== 'looking' && phase.kind !== 'scanning' && phase.kind !== 'invalid' && panel}
        {phase.kind === 'invalid' && (
          <ThemedText style={{ color: muted }}>That isn&apos;t a valid barcode. Use 8, 12, 13 or 14 digits.</ThemedText>
        )}
        {(phase.kind === 'scanning' || phase.kind === 'invalid') && secondaryActions}
      </ScrollView>
    );
  } else {
    body = (
      <>
        <View style={styles.cameraWrap}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
            onBarcodeScanned={locked ? undefined : onScanned}
          />
          {phase.kind === 'looking' && (
            <View
              style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: background + '99' }]}
              accessibilityLabel="Looking up product"
            >
              <ActivityIndicator size="large" color={tint} />
            </View>
          )}
        </View>
        <ScrollView
          style={[styles.panelScroll, { backgroundColor: card, borderTopColor: separator }]}
          contentContainerStyle={styles.panel}
          keyboardShouldPersistTaps="handled"
        >
          {panel}
        </ScrollView>
      </>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: background, paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={goToSearch}
            style={styles.headerSide}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <ThemedText style={{ color: tint }}>Cancel</ThemedText>
          </TouchableOpacity>
          <ThemedText type="defaultSemiBold">Scan barcode</ThemedText>
          <View style={[styles.headerSide, styles.headerRight]}>
            {permission?.granted && (
              <TouchableOpacity
                onPress={() => setTorch((t) => !t)}
                style={styles.torchBtn}
                accessibilityRole="button"
                accessibilityLabel={torch ? 'Turn torch off' : 'Turn torch on'}
                accessibilityState={{ selected: torch }}
              >
                <MaterialIcons name={torch ? 'flash-on' : 'flash-off'} size={22} color={tint} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        {body}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 4,
    minHeight: 48,
  },
  headerSide: { minWidth: 72, minHeight: 44, justifyContent: 'center' },
  headerRight: { alignItems: 'flex-end' },
  torchBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  cameraWrap: { flex: 1, minHeight: 120, flexShrink: 1, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  centerScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  centerText: { textAlign: 'center' },
  panelScroll: { flexGrow: 0, flexShrink: 1, borderTopWidth: StyleSheet.hairlineWidth },
  panel: { padding: 20, gap: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  button: {
    minHeight: 44,
    borderRadius: 18,
    paddingHorizontal: 24,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  buttonText: { fontSize: 15 },
  manualRow: { flexDirection: 'row', gap: 8, alignSelf: 'stretch', marginVertical: 8 },
  manualInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  lookupBtn: {
    minHeight: 44,
    borderRadius: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
