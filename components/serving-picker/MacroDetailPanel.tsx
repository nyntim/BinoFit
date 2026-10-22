import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MacroColors } from '@/constants/theme';
import type { Colors } from '@/constants/theme';
import { NUTRIENTS, type NutrientValues } from '@/lib/nutrients';
import { formatNutrientValue, percent, round1 } from '@/components/serving-picker/format';

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
  proteinGoal, carbGoal, fatGoal, onClose, colors,
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
  colors: Pick<typeof Colors.light, 'cardBackground' | 'icon' | 'separator' | 'text' | 'track'>;
}) {
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
    <View style={[styles.macroDetailCard, { backgroundColor: colors.cardBackground, borderTopColor: colors.separator }]}>
      <View style={styles.macroDetailHeader}>
        <Text style={[styles.macroDetailTitle, { color: colors.text }]}>{title}</Text>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel={`Close ${title.toLowerCase()} details`}
        >
          <Text style={{ color: colors.icon, fontSize: 16 }}>✕</Text>
        </TouchableOpacity>
      </View>
      {visibleRows.map((row) => (
        <DetailRow key={row.key} row={row} color={color} colors={colors} />
      ))}
      {hiddenCount > 0 ? (
        <Text style={[styles.macroDetailNote, { color: colors.icon }]}>{hiddenNote}</Text>
      ) : null}
    </View>
  );
}

function DetailRow({
  row, color, colors,
}: {
  row: MacroDetailRow;
  color: string;
  colors: Pick<typeof Colors.light, 'icon' | 'text' | 'track'>;
}) {
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
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' }}>
          <Text style={[styles.detailRowLabel, { color: colors.text, fontWeight: indent === 0 ? '700' : '600' }]}>
            {row.label}
          </Text>
          <Text style={[styles.detailRowValueInline, { color: colors.icon }]}>
            {'  '}{valueText}
          </Text>
        </View>
        <Text style={[styles.detailRowPct, { color: colors.icon }]}>{pctText}</Text>
      </View>
      {hasValue && row.goal ? (
        <View style={[styles.progressBar, { backgroundColor: colors.track }]}>
          <View style={[styles.progressFill, { width: percent(pct), backgroundColor: color }]} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  macroDetailCard: {
    marginTop: -8,
    borderRadius: 18,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    paddingBottom: 12,
  },
  macroDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  macroDetailTitle: { fontSize: 14, fontWeight: '700' },
  macroDetailNote: { fontSize: 12, paddingHorizontal: 16, marginTop: 8 },
  detailRow: { gap: 4, paddingRight: 16, paddingVertical: 6 },
  detailRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  detailRowLabel: { fontSize: 13 },
  detailRowValueInline: { fontSize: 12, fontVariant: ['tabular-nums'] },
  detailRowPct: { fontSize: 12, fontWeight: '400', minWidth: 36, textAlign: 'right' },

  // Detail progress bars
  progressBar: { height: 4, borderRadius: 2 },
  progressFill: { height: 4, borderRadius: 2 },
});
