import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MacroColors } from '@/constants/theme';
import { BATCH_AMOUNT_ACCESSORY_ID, BatchReviewItem } from '@/components/food-search/BatchReviewItem';
import { useFoodSelection } from '@/hooks/useFoodSelection';
import { useMealDefinitions } from '@/hooks/useMealDefinitions';
import { useThemeColor } from '@/hooks/use-theme-color';
import { batchTotals, canConfirm, selectedCount } from '@/lib/food-selection';
import {
  clearSelectedFoods,
  commitFoodSelection,
  removeSelectedFood,
  resolveSelectedFood,
  setSelectedAmount,
  setSelectedUnit,
} from '@/lib/food-selection-store';
import { syncToSupabase } from '@/lib/sync';
import { homeRouteFor } from '@/lib/tracking-mode';

export default function FoodBatchReviewScreen() {
  const { meal_slot, date } = useLocalSearchParams<{ meal_slot: string; date: string }>();
  const router = useRouter();
  const selection = useFoodSelection();
  const { labelFor, loaded: mealsLoaded } = useMealDefinitions();
  const background = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const danger = useThemeColor({}, 'danger');
  const icon = useThemeColor({}, 'icon');
  const separator = useThemeColor({}, 'separator');
  const text = useThemeColor({}, 'text');
  const tint = useThemeColor({}, 'tint');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const savingRef = useRef(false);

  const count = selectedCount(selection);
  const totals = batchTotals(selection);
  const ready = canConfirm(selection) && Boolean(meal_slot && date) && mealsLoaded && !saving;

  // A stale route (deep link, restarted app) has no matching draft: go back.
  useEffect(() => {
    const { context, order } = selection;
    if (order.length === 0 || context.meal_slot !== meal_slot || context.date !== date) router.back();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = async () => {
    if (!ready || savingRef.current) return;
    savingRef.current = true;
    Keyboard.dismiss();
    setSaving(true);
    setSaveError(false);
    try {
      await commitFoodSelection();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void syncToSupabase();
      router.dismissTo(homeRouteFor() as any);
    } catch {
      setSaveError(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const confirmClearAll = () =>
    Alert.alert('Clear all foods?', 'This removes every selected food.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear all', style: 'destructive', onPress: clearSelectedFoods },
    ]);

  const slotLabel = mealsLoaded ? labelFor(meal_slot, date) : '';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      <View style={[styles.header, { borderBottomColor: separator }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.side} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.headerBtn, { color: tint }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: text }]} accessibilityRole="header" numberOfLines={1}>
          {mealsLoaded ? `Add to ${slotLabel}` : ''}
        </Text>
        <View style={[styles.side, styles.sideRight]}>
          <TouchableOpacity
            onPress={handleAdd}
            disabled={!ready}
            style={[styles.pill, { backgroundColor: tint, opacity: ready || saving ? 1 : 0.4 }]}
            hitSlop={6}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Add ${count} ${count === 1 ? 'food' : 'foods'}`}
            accessibilityState={{ disabled: !ready, busy: saving }}
          >
            {saving ? (
              <ActivityIndicator size="small" color={background} />
            ) : (
              <Text style={[styles.pillText, { color: background }]}>{`Add ${count}`}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {saveError ? (
        <View style={[styles.banner, { backgroundColor: cardBackground }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Text style={[styles.bannerText, { color: text }]}>{"Couldn't add these foods."}</Text>
          <TouchableOpacity onPress={handleAdd} disabled={!ready} style={styles.bannerBtn} accessibilityRole="button" accessibilityState={{ disabled: !ready }}>
            <Text style={[styles.bannerRetry, { color: tint }]}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {count === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: icon }]}>No foods selected</Text>
            <TouchableOpacity onPress={() => router.back()} style={[styles.emptyBtn, { backgroundColor: tint }]} accessibilityRole="button">
              <Text style={[styles.pillText, { color: background }]}>Back to search</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.scroll}>
            <View style={[styles.totals, { backgroundColor: cardBackground }]}>
              <Text style={[styles.totalCal, { color: text }]}>{totals.calories} cal</Text>
              <View style={styles.totalMacros}>
                <Text style={[styles.totalMacro, { color: MacroColors.protein }]}>P {totals.protein}g</Text>
                <Text style={[styles.totalMacro, { color: MacroColors.carbs }]}>C {totals.carbs}g</Text>
                <Text style={[styles.totalMacro, { color: MacroColors.fat }]}>F {totals.fat}g</Text>
              </View>
            </View>
            {selection.order.map((id) => (
              <BatchReviewItem
                key={id}
                item={selection.items[id]}
                onAmount={(raw) => {
                  setSaveError(false);
                  setSelectedAmount(id, raw);
                }}
                onUnit={(unit) => setSelectedUnit(id, unit)}
                onRemove={() => removeSelectedFood(id)}
                onRetry={() => void resolveSelectedFood(id)}
              />
            ))}
            <TouchableOpacity onPress={confirmClearAll} style={styles.clearAll} accessibilityRole="button">
              <Text style={[styles.clearAllText, { color: danger }]}>Clear all</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      {Platform.OS === 'ios' ? (
        <InputAccessoryView nativeID={BATCH_AMOUNT_ACCESSORY_ID}>
          <View style={[styles.accessory, { backgroundColor: cardBackground, borderTopColor: separator }]}>
            <TouchableOpacity onPress={Keyboard.dismiss} style={styles.accessoryBtn} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.accessoryDone, { color: tint }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  side: { width: 80, minHeight: 44, justifyContent: 'center' },
  sideRight: { alignItems: 'flex-end' },
  headerBtn: { fontSize: 16 },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  pill: { minWidth: 64, minHeight: 34, paddingHorizontal: 18, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontSize: 15, fontWeight: '600' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 12, paddingVertical: 10, paddingLeft: 14, paddingRight: 12, borderRadius: 12 },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 18 },
  bannerBtn: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  bannerRetry: { fontSize: 13, fontWeight: '600' },
  scroll: { padding: 16, gap: 12, paddingBottom: 40 },
  totals: { borderRadius: 14, padding: 14, gap: 4 },
  totalCal: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  totalMacros: { flexDirection: 'row', gap: 14 },
  totalMacro: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  clearAll: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  clearAllText: { fontSize: 15, fontWeight: '500' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  emptyText: { fontSize: 15 },
  emptyBtn: { minHeight: 44, paddingHorizontal: 24, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  accessory: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth },
  accessoryBtn: { minHeight: 44, justifyContent: 'center' },
  accessoryDone: { fontSize: 16, fontWeight: '600' },
});
