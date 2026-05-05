import { useState, useEffect } from 'react';
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
import { searchFoodsWithFallback, fetchBrandedFoods, fetchFullFoodProfile, type SearchResults } from '@/lib/food-service';
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
  const [results, setResults] = useState<SearchResults>({ local: [], branded: [], shouldAutoFetch: false });
  const [recentFoods, setRecentFoods] = useState<Food[]>([]);
  const [frequentFoods, setFrequentFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingBranded, setFetchingBranded] = useState(false);

  useEffect(() => {
    Promise.all([getRecentFoods(8), getFrequentFoods(8)]).then(([recent, frequent]) => {
      setRecentFoods(recent);
      setFrequentFoods(frequent);
    });
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults({ local: [], branded: [], shouldAutoFetch: false });
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      searchFoodsWithFallback(query).then((res) => {
        setResults(res);
        setLoading(false);
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const slotLabel = SLOT_LABELS[meal_slot ?? ''] ?? 'Meal';

  const handleLoadBranded = async () => {
    if (fetchingBranded) return;
    setFetchingBranded(true);
    const branded = await fetchBrandedFoods(query, results.local.map(f => f.id));
    setResults(prev => ({
      ...prev,
      branded,
      shouldAutoFetch: false
    }));
    setFetchingBranded(false);
  };

  const selectFood = async (food: Food) => {
    setLoading(true);
    if (food.source === 'branded') {
      await fetchFullFoodProfile(food.id);
    }
    setLoading(false);
    router.replace({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pathname: '/serving-picker' as any,
      params: { food_id: food.id, meal_slot, date },
    });
  };

  const renderFood = (food: Food) => (
    <TouchableOpacity
      key={food.id}
      style={[styles.foodItem, { borderBottomColor: colors.separator }]}
      onPress={() => selectFood(food)}
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
  const allResults = [...results.local, ...results.branded];

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
        {(loading || fetchingBranded) && <ActivityIndicator size="small" color={colors.tint} />}
      </View>

      {showSuggestions ? (
        <ScrollView keyboardShouldPersistTaps="handled">
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
        <FlatList
          data={allResults}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => renderFood(item)}
          ListFooterComponent={() => (
            <>
              {results.shouldAutoFetch && (
                <TouchableOpacity 
                  style={styles.loadMoreBtn} 
                  onPress={handleLoadBranded}
                  disabled={fetchingBranded}
                >
                  <Text style={[styles.loadMoreText, { color: colors.tint }]}>
                    {fetchingBranded ? 'Searching branded foods...' : 'Search branded foods'}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.createFoodBtn, { borderColor: colors.tint + '50', marginTop: 16 }]}
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
            </>
          )}
          ListEmptyComponent={
            !loading ? (
              <Text style={[styles.emptyText, { color: colors.icon }]}>
                No results for &quot;{query}&quot;
              </Text>
            ) : null
          }
        />
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
  loadMoreBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    marginHorizontal: 16,
  },
  loadMoreText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
