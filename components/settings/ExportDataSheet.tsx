import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native';
import { format, parseISO } from 'date-fns';
import { useThemeColor } from '@/hooks/use-theme-color';
import { rangeDates, validExportDates, type ExportRange } from '@/lib/export';
import { loadExport, type ExportKind } from '@/lib/export-data';
import { shareCsv } from '@/lib/export-file';

type Props = { visible: boolean; onClose: () => void };

const RANGES: { value: ExportRange; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
];

const todayString = () => format(new Date(), 'yyyy-MM-dd');
const shortDate = (d: string) => format(parseISO(d), 'MMM d');

type Summary = { count: number; first: string | null; last: string | null };

/** Local CSV exports for food, finished workouts and weight history. */
export function ExportDataSheet({ visible, onClose }: Props) {
  // Remount the body each time it opens so it starts from the default range.
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      {visible && <SheetBody onClose={onClose} />}
    </Modal>
  );
}

function SheetBody({ onClose }: { onClose: () => void }) {
  const overlay = useThemeColor({}, 'overlay');
  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const icon = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const cardSecondary = useThemeColor({}, 'cardSecondary');

  const busy = useRef(false);
  const [revision, setRevision] = useState(0);
  const [kind, setKind] = useState<ExportKind>('food');
  const [custom, setCustom] = useState(false);
  const [startDate, setStartDate] = useState(todayString());
  const [endDate, setEndDate] = useState(todayString());
  const invalid = custom && !validExportDates(startDate, endDate);
  const [range, setRange] = useState<ExportRange>('7d');
  const bounds = custom ? { start: startDate, end: endDate } : rangeDates(range, todayString());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (invalid) return;
    loadExport(kind, bounds.start, bounds.end, todayString())
      .then((document) => {
        if (cancelled) return;
        // Every dataset is ordered by local date.
        setSummary({
          count: document.count, first: document.first, last: document.last,
        });
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, bounds.start, bounds.end, invalid, revision]);

  const selectRange = (next: ExportRange) => {
    if (!custom && next === range) return;
    setCustom(false);
    setRevision((value) => value + 1);
    setSummary(null);
    setLoadFailed(false);
    setFailed(false);
    setRange(next);
  };

  const empty = summary?.count === 0;
  const disabled = exporting || loadFailed || invalid || summary == null || empty;

  const caption = (() => {
    if (loadFailed || summary == null) return ' ';
    if (summary.count === 0 || !summary.first || !summary.last) return 'No saved entries in this range.';
    const noun = summary.count === 1 ? 'entry' : 'entries';
    const span =
      summary.first === summary.last
        ? shortDate(summary.first)
        : `${shortDate(summary.first)} – ${shortDate(summary.last)}`;
    return `${summary.count} ${noun} · ${span}`;
  })();

  const runExport = async () => {
    if (disabled || busy.current) return;
    busy.current = true;
    setExporting(true);
    setFailed(false);
    try {
      const today = todayString();
      const document = await loadExport(kind, bounds.start, bounds.end, today);
      if (!document.count) { setSummary({ count: 0, first: null, last: null }); return; }
      await shareCsv(document.fileName, document.csv);
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
      setExporting(false);
    }
  };

  return (
    <View style={[styles.overlay, { backgroundColor: overlay }]}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityLabel="Close export"
        accessibilityRole="button"
      />
      <ScrollView style={[styles.sheet, { backgroundColor: background }]} contentContainerStyle={{ gap: 12 }}>
        <Text style={[styles.title, { color: text }]}>Export data</Text>

        <Text style={[styles.caption, { color: icon }]}>Saved on this device. Food includes planned entries. Workouts include finished sessions, exercises and sets, with kg, metres and seconds. Weight uses kg.</Text>
        <View style={styles.chips}>
          {(['food', 'workouts', 'weight'] as const).map((value) => <TouchableOpacity key={value} disabled={exporting} accessibilityRole="radio" accessibilityState={{ selected: kind === value }} onPress={() => { if (kind === value) return; setSummary(null); setLoadFailed(false); setKind(value); setFailed(false); }} style={[styles.chip, { backgroundColor: kind === value ? tint : cardSecondary }]}><Text style={[styles.chipText, { color: kind === value ? background : text }]}>{value === 'food' ? 'Food' : value === 'workouts' ? 'Workouts' : 'Weight'}</Text></TouchableOpacity>)}
        </View>
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Date range">
          {RANGES.map((r) => {
            const selected = !custom && range === r.value;
            return (
              <TouchableOpacity
                key={r.value}
                style={[styles.chip, { backgroundColor: selected ? tint : cardSecondary }]}
                disabled={exporting}
                onPress={() => selectRange(r.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.chipText, { color: selected ? background : text }]}>
                  {r.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity disabled={exporting} onPress={() => { if (custom) return; setSummary(null); setLoadFailed(false); setCustom(true); setRevision((value) => value + 1); }} style={styles.chip} accessibilityRole="button"><Text style={{ color: tint }}>Choose dates</Text></TouchableOpacity>
        {custom && <View style={{ gap: 8 }}>
          <Text style={[styles.caption, { color: icon }]}>Inclusive dates, YYYY-MM-DD</Text>
          <TextInput accessibilityLabel="Export start date" editable={!exporting} value={startDate} onChangeText={(value) => { if (startDate === value) return; setSummary(null); setLoadFailed(false); setStartDate(value); }} style={[styles.dateInput, { color: text, backgroundColor: cardSecondary }]} />
          <TextInput accessibilityLabel="Export end date" editable={!exporting} value={endDate} onChangeText={(value) => { if (endDate === value) return; setSummary(null); setLoadFailed(false); setEndDate(value); }} style={[styles.dateInput, { color: text, backgroundColor: cardSecondary }]} />
          {invalid && <Text style={{ color: text }}>Enter valid dates with the start on or before the end.</Text>}
        </View>}
        <Text style={[styles.caption, { color: icon }]} accessibilityLiveRegion="polite">
          {caption}
        </Text>

        {(failed || loadFailed) && (
          <Text style={[styles.caption, { color: text }]} accessibilityLiveRegion="polite">
            Couldn&apos;t read or share this export. Try again.
          </Text>
        )}

        {loadFailed && <TouchableOpacity accessibilityRole="button" style={styles.chip} onPress={() => { setSummary(null); setLoadFailed(false); setRevision((v) => v + 1); }}><Text style={{ color: tint }}>Retry</Text></TouchableOpacity>}
        <TouchableOpacity
          style={[styles.button, { backgroundColor: tint, opacity: disabled ? 0.5 : 1 }]}
          onPress={runExport}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Export"
          accessibilityState={{ disabled, busy: exporting }}
        >
          {exporting ? (
            <ActivityIndicator color={background} />
          ) : (
            <Text style={[styles.buttonText, { color: background }]}>Export</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  dateInput: { minHeight: 44, borderRadius: 8, paddingHorizontal: 16, fontSize: 15 },
  sheet: {
    maxHeight: '90%',
    width: '100%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    paddingBottom: 28,
    gap: 12,
  },
  title: { fontSize: 17, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    justifyContent: 'center',
  },
  chipText: { fontSize: 14, fontWeight: '500' },
  caption: { fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
  button: {
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
});
