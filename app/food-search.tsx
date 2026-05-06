import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
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
import { useScrollRestore } from '@/hooks/useScrollRestore';
import { getRecentFoods, getFrequentFoods } from '@/lib/database';
import {
  searchLocal,
  searchBranded,
  shouldAutoFetchBranded,
  getFullBrandedFood,
} from '@/lib/food-service';
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
  const [brandedRequested, setBrandedRequested] = useState(false);
  const [selecting, setSelecting] = useState(false);

  const searchIdRef = useRef(0);

  const {
    scrollRef: suggestionsScrollRef,
    onScroll: onSuggestionsScroll,
    onContentSizeChange: onSuggestionsContentSizeChange,
  } = useScrollRestore('food-search-suggestions');

  const {
    scrollRef: resultsScrollRef,
    onScroll: onResultsScroll,
    onContentSizeChange: onResultsContentSizeChange,
  } = useScrollRestore('food-search-results');

  useEffect(() => {
    Promise.all([getRecentFoods(8), getFrequentFoods(8)]).then(([recent, frequent]) => {
      setRecentFoods(recent);
      setFrequentFoods(frequent);
    });
  }, []);

  const fetchBranded = useCallback(
    async (q: string, excludeIds: string[], id: number) => {
      setBrandedLoading(true);
      try {
        const branded = await searchBranded(q, excludeIds);
        if (id === searchIdRef.current) {
          setBrandedResults(branded);
        }
      } finally {
        if (id === searchIdRef.current) {
          setBrandedLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setLocalResults([]);
      setBrandedResults([]);
      setBrandedRequested(false);
      return;
    }

    setLocalLoading(true);
    setBrandedResults([]);
    setBrandedRequested(false);

    const id = ++searchIdRef.current;

    const timer = setTimeout(async () => {
      const local = await searchLocal(trimmed);
      if (id !== searchIdRef.current) return;

      setLocalResults(local);
      setLocalLoading(false);

      if (shouldAutoFetchBranded(local.length)) {
        setBrandedRequested(true);
        fetchBranded(trimmed, local.map((f) => f.id), id);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, fetchBranded]);

  const handleLoadBranded = () => {
    setBrandedRequested(true);
    fetchBranded(query, localResults.map((f) => f.id), searchIdRef.current);
  };

  const slotLabel = SLOT_LABELS[meal_slot ?? ''] ?? 'Meal';

  const selectFood = async (food: Food) => {
    if (selecting) return;
    setSelecting(true);
    try {
      if (food.source === 'branded' || (!food.source?.startsWith('usda') && !food.source?.startsWith('custom') && food.brand)) {
        await getFullBrandedFood(food.id);
      }
      router.replace({
        pathname: '/serving-picker' as any,
        params: { food_id: food.id, meal_slot, date },
      });
    } finally {
      setSelecting(false);
    }
  };

  const renderFood = (food: Food) => (
    <TouchableOpacity
      key={food.id}
      style={[styles.foodItem, { borderBottomColor: colors.separator }]}
      onPress={() => selectFood(food)}
      activeOpacity={0.7}
      disabled={selecting}
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
  const showBrandedButton =
    !showSuggestions &&
    !brandedRequested &&
    localResults.length >= 8 &&
    query.trim().length >= 3;

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
        {(localLoading || brandedLoading || selecting) && (
          <ActivityIndicator size="small" color={colors.tint} />
        )}
      </View>

      {showSuggestions ? (
        <ScrollView
          ref={suggestionsScrollRef}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={onSuggestionsScroll}
          onContentSizeChange={onSuggestionsContentSizeChange}
        >
          {recentFoods.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.icon }]}>RECENT</Text>
              {recentFoods.map(renderFood)}
            </>
          )}
          {frequentFoods.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.icon }]}>FREQUENT</Text>
              {frequentFoods.map(renderFood)}
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
        <ScrollView
          ref={resultsScrollRef}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.resultsScroll}
          scrollEventThrottle={16}
          onScroll={onResultsScroll}
          onContentSizeChange={onResultsContentSizeChange}
        >
          {/* Local results */}
          {localResults.map(renderFood)}

          {localResults.length === 0 && !localLoading && (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: colors.icon }]}>
                No results for &quot;{query}&quot;
              </Text>
              <Text style={[styles.emptyHint, { color: colors.icon }]}>
                Try different words or check the spelling
              </Text>
            </View>
          )}

          {/* Branded section */}
          {brandedRequested && (
            <>
              <View style={[styles.divider, { backgroundColor: colors.separator }]} />
              <Text style={[styles.sectionTitle, { color: colors.icon }]}>BRANDED</Text>

              {brandedLoading && (
                <ActivityIndicator
                  size="small"
                  color={colors.tint}
                  style={styles.brandedSpinner}
                />
              )}

              {!brandedLoading && brandedResults.length === 0 && (
                <Text style={[styles.emptyHint, { color: colors.icon }]}>
                  No branded results found
                </Text>
              )}

              {brandedResults.map(renderFood)}
            </>
          )}

          {/* Load branded button */}
          {showBrandedButton && (
            <TouchableOpacity
              style={[styles.loadBrandedBtn, { borderColor: colors.tint + '50' }]}
              onPress={handleLoadBranded}
              activeOpacity={0.7}
              disabled={brandedLoading}
            >
              <Text style={[styles.loadBrandedText, { color: colors.tint }]}>
                {brandedLoading ? 'Loading branded foods...' : 'Load branded foods'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Create custom */}
          <TouchableOpacity
            style={[styles.createFoodBtn, { borderColor: colors.tint + '50' }]}
            onPress={() =>
              router.replace({
                pathname: '/custom-food' as any,
                params: { meal_slot, date },
              })
            }
            activeOpacity={0.7}
          >
            <Text style={[styles.createFoodText, { color: colors.tint }]}>+ Create custom food</Text>
          </TouchableOpacity>
        </ScrollView>
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
  resultsScroll: { paddingBottom: 40 },
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
  emptyState: { alignItems: 'center', marginTop: 48 },
  emptyText: { textAlign: 'center', fontSize: 15 },
  emptyHint: { textAlign: 'center', paddingVertical: 6, fontSize: 13 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16, marginTop: 8 },
  brandedSpinner: { paddingVertical: 16 },
  loadBrandedBtn: {
    marginHorizontal: 16,
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  loadBrandedText: { fontSize: 14, fontWeight: '500' },
  createFoodBtn: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 32,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderStyle: 'dashed',
  },
  createFoodText: { fontSize: 15, fontWeight: '500' },
});
