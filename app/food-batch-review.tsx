import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { format, isValid, parseISO } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { StickyFooter } from '@/components/ui/StickyFooter';
import { BATCH_AMOUNT_ACCESSORY_ID, BatchReviewItem } from '@/components/food-search/BatchReviewItem';
import { useFoodSelection } from '@/hooks/useFoodSelection';
import { useMealDefinitions } from '@/hooks/useMealDefinitions';
import { useNewFoodStatus } from '@/hooks/useNewFoodStatus';
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
import type { MealSlot } from '@/lib/types';

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
  const tint = useThemeColor({}, 'tint');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const savingRef = useRef(false);
  const { width } = useWindowDimensions();

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
  const status = useNewFoodStatus(date, meal_slot as MealSlot | undefined);
  const dateLine = [date && isValid(parseISO(date)) ? format(parseISO(date), 'EEE d MMM') : null, status === 'eaten' ? 'Eaten' : status === 'planned' ? 'Planned' : null].filter(Boolean).join(' · ');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.side} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back to search">
          <View style={styles.back}>
            <IconSymbol name="chevron.left" size={22} color={tint} />
            <Text style={[styles.headerBtn, { color: tint }]}>Search</Text>
          </View>
        </TouchableOpacity>
        <ThemedText type="title" style={styles.title} accessibilityRole="header" numberOfLines={1}>Review</ThemedText>
        <View style={[styles.side, styles.sideRight]}>
          <Button label="Clear all" variant="danger" size="sm" onPress={confirmClearAll} disabled={count === 0} />
        </View>
      </View>

      {saveError ? (
        <Card padding="compact" style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <IconSymbol name="exclamationmark.circle" size={18} color={danger} />
          <ThemedText type="label" style={styles.bannerText}>{"Couldn't add these foods."}</ThemedText>
          <Button label="Try again" variant="ghost" size="sm" onPress={handleAdd} disabled={!ready} />
        </Card>
      ) : null}

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {count === 0 ? (
          <View style={styles.empty}>
            <ThemedText type="body" style={{ color: icon }}>No foods selected</ThemedText>
            <Button label="Back to search" onPress={() => router.back()} />
          </View>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.scroll}>
            <View style={styles.heading}>
              <ThemedText type="heading" style={styles.headline}>
                {mealsLoaded ? `${count} ${count === 1 ? 'food' : 'foods'} for ${slotLabel}` : `${count} ${count === 1 ? 'food' : 'foods'}`}
              </ThemedText>
              {dateLine ? <ThemedText type="label" style={{ color: icon }}>{dateLine}</ThemedText> : null}
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
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      {count > 0 ? (
        <StickyFooter style={styles.footer}>
          <View style={[styles.footerContent, { width: width - 32 }]}>
            <View style={styles.totalRow}>
              <ThemedText type="label" style={{ color: icon }}>Total</ThemedText>
              <View style={styles.totalValues}>
                <ThemedText type="stat" style={styles.totalCal}>{totals.calories}</ThemedText>
                <ThemedText type="caption" style={styles.tabular}>{`cal · P ${totals.protein} · C ${totals.carbs} · F ${totals.fat}`}</ThemedText>
              </View>
            </View>
            <Button
              size="lg"
              label={`Log ${count} ${count === 1 ? 'food' : 'foods'}`}
              disabled={!ready}
              loading={saving}
              onPress={handleAdd}
            />
          </View>
        </StickyFooter>
      ) : null}

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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 6 },
  side: { minWidth: 96, minHeight: 44, justifyContent: 'center' },
  sideRight: { alignItems: 'flex-end' },
  back: { flexDirection: 'row', alignItems: 'center', marginLeft: -6 },
  headerBtn: { fontSize: 17 },
  title: { flex: 1, textAlign: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 12 },
  bannerText: { flex: 1 },
  scroll: { padding: 16, gap: 12, paddingBottom: 24 },
  heading: { gap: 4, marginBottom: 4 },
  headline: { fontSize: 26, lineHeight: 31 },
  // The footer's action slot sizes to its content, so the column is given the full row width
  footer: { gap: 0 },
  footerContent: { gap: 10 },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  totalValues: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6, flexShrink: 1 },
  totalCal: { fontSize: 20, lineHeight: 24 },
  tabular: { fontVariant: ['tabular-nums'] },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  accessory: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth },
  accessoryBtn: { minHeight: 44, justifyContent: 'center' },
  accessoryDone: { fontSize: 16, fontWeight: '600' },
});
