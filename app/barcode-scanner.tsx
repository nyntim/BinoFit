import { useEffect, useRef, useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Linking,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ScanMissSheet } from '@/components/barcode-scanner/ScanMissSheet';
import { Viewfinder } from '@/components/barcode-scanner/Viewfinder';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
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

/**
 * The camera chrome is always dark, in light and dark mode. The colors are the dark theme tokens,
 * passed through useThemeColor so they stay named tokens.
 */
function useCameraPalette() {
  return {
    background: useThemeColor({ light: Colors.dark.background, dark: Colors.dark.background }, 'background'),
    text: useThemeColor({ light: Colors.dark.text, dark: Colors.dark.text }, 'text'),
    track: useThemeColor({ light: Colors.dark.track, dark: Colors.dark.track }, 'track'),
    overlay: useThemeColor({ light: Colors.dark.overlay, dark: Colors.dark.overlay }, 'overlay'),
    tint: useThemeColor({ light: Colors.dark.tint, dark: Colors.dark.tint }, 'tint'),
    icon: useThemeColor({ light: Colors.dark.icon, dark: Colors.dark.icon }, 'icon'),
  };
}
type Palette = ReturnType<typeof useCameraPalette>;

/** Camera button on palette tokens: `Button` variants read the current theme, so these are local. */
function CamButton({ label, onPress, palette, solid = false, half = false }: {
  label: string; onPress: () => void; palette: Palette; solid?: boolean; half?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.camButton, half && styles.half, { backgroundColor: solid ? palette.text : palette.track }, pressed && styles.pressed]}
    >
      <ThemedText type="defaultSemiBold" lightColor={solid ? palette.background : palette.text} darkColor={solid ? palette.background : palette.text} style={styles.camButtonText}>{label}</ThemedText>
    </Pressable>
  );
}

function CamText({ children, muted, palette, style, ...rest }: {
  children: React.ReactNode; muted?: boolean; palette: Palette; style?: object; accessibilityLiveRegion?: 'polite';
}) {
  const color = muted ? palette.icon : palette.text;
  return <ThemedText lightColor={color} darkColor={color} style={style} {...rest}>{children}</ThemedText>;
}

export default function BarcodeScannerScreen() {
  const { meal_slot, date } = useLocalSearchParams<{ meal_slot: string; date: string }>();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  // Explicit insets: SafeAreaView can report zero inside a native fullScreenModal,
  // which put the header under the notch / status bar.
  const insets = useSafeAreaInsets();

  const palette = useCameraPalette();

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

  const missPhase = phase.kind === 'not_found' || phase.kind === 'incomplete' || phase.kind === 'error' ? phase : null;
  const noDigits = manualCode.replace(/\D/g, '').length === 0;
  const granted = !!permission?.granted;

  const manualEntry = (
    <View style={styles.manualRow}>
      <TextInput
        style={[styles.manualInput, { color: palette.text, backgroundColor: palette.track, borderColor: palette.icon }]}
        placeholder="Barcode digits"
        placeholderTextColor={palette.icon}
        value={manualCode}
        onChangeText={setManualCode}
        keyboardType="number-pad"
        returnKeyType="search"
        onSubmitEditing={submitManual}
        accessibilityLabel="Barcode digits"
        autoFocus
      />
      <Pressable
        onPress={submitManual}
        disabled={noDigits}
        accessibilityRole="button"
        accessibilityLabel="Look up barcode"
        accessibilityState={{ disabled: noDigits }}
        style={[styles.lookupBtn, { backgroundColor: palette.text, opacity: noDigits ? 0.4 : 1 }]}
      >
        <ThemedText type="defaultSemiBold" lightColor={palette.background} darkColor={palette.background}>Look up</ThemedText>
      </Pressable>
    </View>
  );

  const bottomButtons = (
    <View style={styles.buttonRow}>
      {!manual && <CamButton half palette={palette} label="Enter digits" onPress={() => setManual(true)} />}
      <CamButton half solid palette={palette} label="Search by name" onPress={goToSearch} />
    </View>
  );

  const prompt = phase.kind === 'invalid' ? (
    <>
      <CamText palette={palette} style={styles.promptTitle} accessibilityLiveRegion="polite">That isn&apos;t a valid barcode. Use 8, 12, 13 or 14 digits.</CamText>
      <CamButton solid palette={palette} label="Scan again" onPress={rescan} />
    </>
  ) : (
    <>
      <CamText palette={palette} style={styles.promptTitle}>Point the camera at a barcode</CamText>
      <CamText palette={palette} muted style={styles.promptBody}>Products come from Open Food Facts</CamText>
    </>
  );

  const lookingRow = (
    <View style={styles.statusRow} accessibilityLabel="Looking up product" accessible>
      <ActivityIndicator color={palette.text} />
      <CamText palette={palette} muted accessibilityLiveRegion="polite">Looking up product…</CamText>
    </View>
  );

  return (
    <View
      style={[styles.container, { backgroundColor: palette.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}
    >
      {/* The camera chrome is dark in both themes */}
      <StatusBar style="light" />
      {granted && (
        <>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
            onBarcodeScanned={locked ? undefined : onScanned}
          />
          <Viewfinder maskColor={palette.overlay} bracketColor={palette.text} lineColor={palette.tint} />
        </>
      )}

      <View style={styles.topRow}>
        <Pressable
          onPress={goToSearch}
          style={[styles.roundBtn, { backgroundColor: palette.track }]}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <MaterialIcons name="close" size={22} color={palette.text} />
        </Pressable>
        <ThemedText type="title" lightColor={palette.text} darkColor={palette.text} accessibilityRole="header">Scan barcode</ThemedText>
        {granted ? (
          <Pressable
            onPress={() => setTorch((t) => !t)}
            style={[styles.roundBtn, { backgroundColor: palette.track }]}
            accessibilityRole="togglebutton"
            accessibilityLabel={torch ? 'Turn off flashlight' : 'Turn on flashlight'}
            accessibilityState={{ checked: torch }}
          >
            <MaterialIcons name={torch ? 'flashlight-on' : 'flashlight-off'} size={22} color={palette.text} />
          </Pressable>
        ) : (
          <View style={styles.roundBtn} />
        )}
      </View>

      {!permission ? (
        <View style={styles.center}><ActivityIndicator color={palette.text} /></View>
      ) : !granted ? (
        <ScrollView contentContainerStyle={styles.centerScroll} keyboardShouldPersistTaps="handled">
          <CamText palette={palette} style={styles.centerText}>
            {permission.canAskAgain ? 'Camera access is needed to scan barcodes.' : 'Camera access is off for BinoFit.'}
          </CamText>
          {permission.canAskAgain ? (
            <CamButton solid palette={palette} label="Allow camera" onPress={() => requestPermission()} />
          ) : (
            <CamButton solid palette={palette} label="Open Settings" onPress={() => Linking.openSettings()} />
          )}
          {manual && manualEntry}
          {phase.kind === 'looking' && lookingRow}
          {phase.kind === 'invalid' && (
            <CamText palette={palette} muted style={styles.centerText}>That isn&apos;t a valid barcode. Use 8, 12, 13 or 14 digits.</CamText>
          )}
          {!manual && <CamButton palette={palette} label="Enter digits" onPress={() => setManual(true)} />}
          <CamButton palette={palette} label="Search by name" onPress={goToSearch} />
        </ScrollView>
      ) : null}

      {granted && phase.kind === 'looking' && (
        <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: palette.overlay }]} accessibilityLabel="Looking up product" accessible>
          <ActivityIndicator size="large" color={palette.text} />
        </View>
      )}

      {missPhase && <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.overlay }]} pointerEvents="none" />}

      {granted && !missPhase && phase.kind !== 'looking' && (
        <KeyboardAvoidingView
          style={[styles.bottom, { bottom: insets.bottom + 24 }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {prompt}
          {manual && manualEntry}
          {bottomButtons}
        </KeyboardAvoidingView>
      )}

      {missPhase && (
        <KeyboardAvoidingView style={StyleSheet.absoluteFill} pointerEvents="box-none" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScanMissSheet
            key={`${missPhase.kind}:${missPhase.code}`}
            phase={missPhase}
            bottomInset={insets.bottom}
            onLookup={runLookup}
            onCreate={goToCreate}
            onRescan={rescan}
            onSearch={goToSearch}
          />
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  roundBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  centerScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  centerText: { textAlign: 'center' },
  bottom: { position: 'absolute', left: 16, right: 16, gap: 10 },
  promptTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  promptBody: { fontSize: 13, textAlign: 'center', opacity: 0.7 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  buttonRow: { flexDirection: 'row', gap: 10 },
  camButton: { minHeight: 52, borderRadius: 16, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  half: { flex: 1 },
  camButtonText: { fontSize: 16 },
  pressed: { opacity: 0.85 },
  manualRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch' },
  manualInput: { flex: 1, minHeight: 52, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, fontSize: 16 },
  lookupBtn: { minHeight: 52, borderRadius: 16, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
});
