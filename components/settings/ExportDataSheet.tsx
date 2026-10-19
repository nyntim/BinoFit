import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { format, parseISO } from 'date-fns';
import { useThemeColor } from '@/hooks/use-theme-color';
import {
  getFoodLogsWithFoodInRange,
  getMealDefinitions,
  getMealNames,
  getMealSlotConfirmationsInRange,
} from '@/lib/database';
import {
  buildExportRows,
  exportFileName,
  rangeDates,
  toCsv,
  type ExportRange,
} from '@/lib/export';
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

/** Sheet for exporting the food log as a CSV file. */
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

  const [range, setRange] = useState<ExportRange>('7d');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const { start, end } = rangeDates(range, todayString());
    getFoodLogsWithFoodInRange(start, end)
      .then((logs) => {
        if (cancelled) return;
        // Logs are ordered by date, so the ends give the span.
        setSummary({
          count: logs.length,
          first: logs[0]?.date ?? null,
          last: logs[logs.length - 1]?.date ?? null,
        });
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const selectRange = (next: ExportRange) => {
    if (next === range) return;
    setSummary(null);
    setLoadFailed(false);
    setFailed(false);
    setRange(next);
  };

  const empty = summary?.count === 0;
  const disabled = exporting || summary == null || empty;

  const caption = (() => {
    if (loadFailed || summary == null) return ' ';
    if (summary.count === 0 || !summary.first || !summary.last) return 'No food logged in this range.';
    const noun = summary.count === 1 ? 'entry' : 'entries';
    const span =
      summary.first === summary.last
        ? shortDate(summary.first)
        : `${shortDate(summary.first)} – ${shortDate(summary.last)}`;
    return `${summary.count} ${noun} · ${span}`;
  })();

  const runExport = async () => {
    if (disabled) return;
    setExporting(true);
    setFailed(false);
    try {
      const today = todayString();
      const { start, end } = rangeDates(range, today);
      const [logs, defs, names, confirmations] = await Promise.all([
        getFoodLogsWithFoodInRange(start, end),
        getMealDefinitions(),
        getMealNames(),
        getMealSlotConfirmationsInRange(start, end),
      ]);
      const csv = toCsv(buildExportRows(logs, defs, names, confirmations));
      await shareCsv(exportFileName(start, end, today), csv);
    } catch {
      setFailed(true);
    } finally {
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
      <View style={[styles.sheet, { backgroundColor: background }]}>
        <Text style={[styles.title, { color: text }]}>Export data</Text>

        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Date range">
          {RANGES.map((r) => {
            const selected = range === r.value;
            return (
              <TouchableOpacity
                key={r.value}
                style={[styles.chip, { backgroundColor: selected ? tint : cardSecondary }]}
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

        <Text style={[styles.caption, { color: icon }]} accessibilityLiveRegion="polite">
          {caption}
        </Text>

        {(failed || loadFailed) && (
          <Text style={[styles.caption, { color: text }]} accessibilityLiveRegion="polite">
            Couldn&apos;t create the export.
          </Text>
        )}

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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
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
