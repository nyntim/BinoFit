import { Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { MacroColors } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { NUTRIENTS, type NutrientValues } from '@/lib/nutrients';
import { formatNutrientValue, round1 } from '@/components/serving-picker/format';

type MacroDetailRow = {
  key: string;
  label: string;
  value: number | null;
  goal: number | null;
  unit?: string;
  indent?: number;
};

function buildMacroRows(
  macro: 'protein' | 'carbs' | 'fat',
  pro: number,
  carb: number,
  fat: number,
  nutrients: NutrientValues,
  proteinGoal: number | null,
  carbGoal: number | null,
  fatGoal: number | null,
): MacroDetailRow[] {
  if (macro === 'protein') {
    return [
      { key: 'total', label: 'Protein (Total)', value: pro, goal: proteinGoal, indent: 0 },
      { key: 'cystine', label: 'Cystine', value: null, goal: null, indent: 1 },
      { key: 'histidine', label: 'Histidine', value: null, goal: null, indent: 1 },
      { key: 'isoleucine', label: 'Isoleucine', value: null, goal: null, indent: 1 },
      { key: 'leucine', label: 'Leucine', value: null, goal: null, indent: 1 },
      { key: 'lysine', label: 'Lysine', value: null, goal: null, indent: 1 },
      { key: 'methionine', label: 'Methionine', value: null, goal: null, indent: 1 },
      { key: 'phenylalanine', label: 'Phenylalanine', value: null, goal: null, indent: 1 },
      { key: 'threonine', label: 'Threonine', value: null, goal: null, indent: 1 },
      { key: 'tryptophan', label: 'Tryptophan', value: null, goal: null, indent: 1 },
      { key: 'tyrosine', label: 'Tyrosine', value: null, goal: null, indent: 1 },
      { key: 'valine', label: 'Valine', value: null, goal: null, indent: 1 },
    ];
  }
  const rows: MacroDetailRow[] = [
    { key: 'total', label: macro === 'carbs' ? 'Carbs (Total)' : 'Fats (Total)', value: macro === 'carbs' ? carb : fat, goal: macro === 'carbs' ? carbGoal : fatGoal, unit: 'g' },
    ...NUTRIENTS.filter((nutrient) => 'macroParent' in nutrient && nutrient.macroParent === macro).map(({ id, label, unit }) => ({ key: id, label, value: nutrients[id], goal: null, unit: unit === 'ug' ? 'µg' : unit, indent: 1 })),
  ];
  if (macro === 'carbs' && nutrients.fiber !== null) rows.push({ key: 'net', label: 'Carbs (Net)', value: round1(carb - nutrients.fiber), goal: null, unit: 'g' });
  return rows;
}

export function MacroDetailPanel({
  macro, pro, carb, fat, nutrients,
  proteinGoal, carbGoal, fatGoal, onClose,
}: {
  macro: 'protein' | 'carbs' | 'fat';
  pro: number;
  carb: number;
  fat: number;
  nutrients: NutrientValues;
  proteinGoal: number | null;
  carbGoal: number | null;
  fatGoal: number | null;
  onClose: () => void;
}) {
  const panel = useThemeColor({}, 'cardSecondary');
  const icon = useThemeColor({}, 'icon');
  const rows = buildMacroRows(macro, pro, carb, fat, nutrients, proteinGoal, carbGoal, fatGoal);
  // Rows with no data are hidden; a single note says so
  const visibleRows = rows.filter((r) => r.value != null);
  const hiddenCount = rows.length - visibleRows.length;
  const color = macro === 'protein' ? MacroColors.protein : macro === 'carbs' ? MacroColors.carbs : MacroColors.fat;
  const title = macro === 'protein' ? 'Protein' : macro === 'carbs' ? 'Carbs' : 'Fats';
  const hiddenNote = macro === 'protein'
    ? 'No amino acid data for this food'
    : 'Details with no data for this food are hidden';

  return (
    <View style={[styles.macroDetailCard, { backgroundColor: panel }]}>
      <View style={styles.macroDetailHeader}>
        <ThemedText type="label" style={styles.macroDetailTitle}>{title}</ThemedText>
        <Pressable
          onPress={onClose}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel={`Close ${title.toLowerCase()} details`}
        >
          <IconSymbol name="xmark" size={16} color={icon} />
        </Pressable>
      </View>
      {visibleRows.map((row) => (
        <DetailRow key={row.key} row={row} color={color} />
      ))}
      {hiddenCount > 0 ? (
        <ThemedText type="caption" style={styles.macroDetailNote}>{hiddenNote}</ThemedText>
      ) : null}
    </View>
  );
}

function DetailRow({ row, color }: { row: MacroDetailRow; color: string }) {
  const hasValue = row.value != null;
  const indent = row.indent ?? 0;
  const pct = hasValue && row.goal
    ? Math.min((row.value as number) / Math.max(row.goal, 1), 1)
    : 0;
  const valueText = !hasValue
    ? 'No Data'
    : row.goal
    ? `${formatNutrientValue(row.value!)} / ${row.goal} ${row.unit ?? 'g'}`
    : `${formatNutrientValue(row.value!)} ${row.unit ?? 'g'}`;
  const pctText = hasValue && row.goal ? `${Math.round(pct * 100)}%` : '0%';

  return (
    <View style={[styles.detailRow, { paddingLeft: 16 + indent * 16 }]}>
      <View style={styles.detailRowTop}>
        <View style={styles.detailText}>
          <ThemedText type="label" style={{ fontWeight: indent === 0 ? '700' : '600' }}>{row.label}</ThemedText>
          <ThemedText type="caption" style={styles.tabular}>{`  ${valueText}`}</ThemedText>
        </View>
        <ThemedText type="caption" style={styles.pct}>{pctText}</ThemedText>
      </View>
      {hasValue && row.goal ? <ProgressBar value={pct} max={1} color={color} height={6} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  macroDetailCard: { borderRadius: 14, paddingVertical: 8 },
  macroDetailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 16, paddingRight: 4 },
  macroDetailTitle: { fontWeight: '700' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  macroDetailNote: { paddingHorizontal: 16, marginTop: 4, marginBottom: 4 },
  detailRow: { gap: 4, paddingRight: 16, paddingVertical: 6 },
  detailRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  detailText: { flex: 1, flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
  tabular: { fontVariant: ['tabular-nums'] },
  pct: { minWidth: 36, textAlign: 'right' },
});
