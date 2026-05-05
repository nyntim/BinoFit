import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Colors, MacroColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getRecentFoods, getFrequentFoods } from '@/lib/database';
import { searchLocal, searchBranded, shouldAutoFetchBranded, getFullBrandedFood } from '@/lib/food-service';
import type { Food } from '@/lib/types';

const SLOT_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

export default function FoodSearchScreen() {
  const { meal_slot, date } = useLocalSearchParams<{ meal_slot: string; date: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [query, setQuery] = useState('');
  const [localResults, setLocalResults] = useState<Food[]>([]);
  const [brandedResults, setBrandedResults] = useState<Food[]>([]);
  const [recentFoods, setRecentFoods] = useState<Food[]>([]);
  const [frequentFoods, setFrequentFoods] = useState<Food[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [brandedLoading, setBrandedLoading] = useState(false);
  const [canLoadMore, setCanLoadMore] = useState(false);
  const [brandedRequested, setBrandedRequested] = useState(false);
  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    Promise.all([getRecentFoods(8), getFrequentFoods(8)]).then(([recent, frequent]) => {
      setRecentFoods(recent);
      setFrequentFoods(frequent);
    });
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setLocalResults([]);
      setBrandedResults([]);
      setCanLoadMore(false);
      setBrandedRequested(false);
      return;
    }

    setLocalLoading(true);
    setBrandedResults([]);
    setCanLoadMore(false);
    setBrandedRequested(false);

    const timer = setTimeout(async () => {
      const local = await searchLocal(trimmed);
      if (queryRef.current.trim() !== trimmed) return;

      setLocalResults(local);
      setLocalLoading(false);

      if (shouldAutoFetchBranded(trimmed, local.length)) {
        setBrandedLoading(true);
        const branded = await searchBranded(trimmed, local.map((f) => f.id));
        if (queryRef.current.trim() !== trimmed) return;
        setBrandedResults(branded);
        setBrandedLoading(false);
        setBrandedRequested(true);
      } else if (trimmed.length >= 3) {
        setCanLoadMore(true);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  const loadBranded = useCallback(async () => {
    const trimmed = query.trim();
    if (trimmed.length < 3 || brandedRequested) return;
    setBrandedLoading(true);
    setCanLoadMore(false);
    const branded = await searchBranded(trimmed, localResults.map((f) => f.id));
    if (queryRef.current.trim() === trimmed) {
      setBrandedResults(branded);
      setBrandedRequested(true);
    }
    setBrandedLoading(false);
  }, [query, localResults, brandedRequested]);

  const slotLabel = SLOT_LABELS[meal_slot ?? ''] ?? 'Meal';

  const selectFood = useCallback(async (food: Food, isBranded: boolean) => {
    if (isBranded) {
      await getFullBrandedFood(food.id);
    }
    router.replace({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pathname: '/serving-picker' as any,
      params: { food_id: food.id, meal_slot, date },
    });
  }, [router, meal_slot, date]);

  const renderFood = (food: Food, isBranded = false) => (
    <TouchableOpacity
      key={food.id}
      style={[styles.foodItem, { borderBottomColor: colors.separator }]}
      onPress={() => selectFood(food, isBranded)}
      activeOpacity={0.7}
    >
      <View style={styles.foodInfo}>
        <Text style={[styles.foodName, { color: colors.text }]} numberOfLines={1}>
          {food.name}
        </Text>
        {food.brand ? (
          <Text style={[styles.foodBrand, { color: colors.icon }]} numberOfLines={1}>
            {food.brand}
          </Text>
        ) : null}
        <Text style={[styles.foodMeta, { color: colors.icon }]}>
          {food.serving_units} · {food.calories} kcal
        </Text>
      </View>
      <View style={styles.macroChips}>
        <Text style={[styles.chip, { color: MacroColors.protein }]}>P {food.protein}g</Text>
        <Text style={[styles.chip, { color: MacroColors.carbs }]}>C {food.carbs}g</Text>
        <Text style={[styles.chip, { color: MacroColors.fat }]}>F {food.fat}g</Text>
      </View>
    </TouchableOpacity>
  );

  const showSuggestions = !query.trim();

  const renderSearchResults = () => {
    const hasLocal = localResults.length > 0;
    const hasBranded = brandedResults.length > 0;
    const showEmpty = !localLoading && !hasLocal && !hasBranded && !brandedLoading;

    return (
      <ScrollView keyboardShouldPersistTaps="handled">
        {hasLocal && localResults.map((f) => renderFood(f, false))}

        {showEmpty && (
          <Text style={[styles.emptyText, { color: colors.icon }]}>
            No results for &quot;{query}&quot;
          </Text>
        )}

        {(hasBranded || brandedLoading || canLoadMore) && (
          <View style={styles.brandedSection}>
            <View style={[styles.divider, { backgroundColor: colors.separator }]} />
            <Text style={[styles.sectionTitle, { color: colors.icon }]}>BRANDED FOODS</Text>
          </View>
        )}

        {brandedLoading && (
          <ActivityIndicator size="small" color={colors.tint} style={styles.brandedSpinner} />
        )}

        {hasBranded && brandedResults.map((f) => renderFood(f, true))}

        {canLoadMore && !brandedLoading && (
          <TouchableOpacity
            style={[styles.loadMoreBtn, { borderColor: colors.tint + '40' }]}
            onPress={loadBranded}
            activeOpacity={0.7}
          >
            <MaterialIcons name="cloud-download" size={16} color={colors.tint} />
            <Text style={[styles.loadMoreText, { color: colors.tint }]}>
              Load branded foods
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn}>
          <Text style={[styles.cancelText, { color: colors.tint }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Add to {slotLabel}</Text>
        <View style={styles.cancelBtn} />
      </View>

      <View style={[styles.searchBar, { backgroundColor: colors.cardBackground }]}>
        <MaterialIcons name="search" size={20} color={colors.icon} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search foods…"
          placeholderTextColor={colors.icon}
          value={query}
          onChangeText={setQuery}
          autoFocus
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {localLoading && <ActivityIndicator size="small" color={colors.tint} />}
      </View>

      {showSuggestions ? (
        <ScrollView keyboardShouldPersistTaps="handled">
          {recentFoods.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.icon }]}>RECENT</Text>
              {recentFoods.map((f) => renderFood(f, false))}
            </>
          )}
          {frequentFoods.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.icon }]}>FREQUENT</Text>
              {frequentFoods.map((f) => renderFood(f, false))}
            </>
          )}
          {recentFoods.length === 0 && frequentFoods.length === 0 && (
            <Text style={[styles.emptyText, { color: colors.icon }]}>
              Search for a food to get started
            </Text>
          )}
          <TouchableOpacity
            style={[styles.createFoodBtn, { borderColor: colors.tint + '50' }]}
            onPress={() =>
              router.replace({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                pathname: '/custom-food' as any,
                params: { meal_slot, date },
              })
            }
            activeOpacity={0.7}
          >
            <Text style={[styles.createFoodText, { color: colors.tint }]}>+ Create custom food</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        renderSearchResults()
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cancelBtn: { width: 64 },
  cancelText: { fontSize: 16 },
  title: { fontSize: 17, fontWeight: '600' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  foodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  foodInfo: { flex: 1, marginRight: 8 },
  foodName: { fontSize: 15, fontWeight: '500' },
  foodBrand: { fontSize: 13, marginTop: 1 },
  foodMeta: { fontSize: 12, marginTop: 2 },
  macroChips: { alignItems: 'flex-end', gap: 2 },
  chip: { fontSize: 11, fontWeight: '600' },
  emptyText: { textAlign: 'center', marginTop: 48, fontSize: 15 },
  createFoodBtn: {
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 32,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderStyle: 'dashed',
  },
  createFoodText: { fontSize: 15, fontWeight: '500' },
  brandedSection: {
    marginTop: 8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
  brandedSpinner: {
    marginVertical: 16,
  },
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 16,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
  },
  loadMoreText: { fontSize: 14, fontWeight: '500' },
});
