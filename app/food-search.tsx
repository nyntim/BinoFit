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
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { searchFoods, getRecentFoods, getFrequentFoods } from '@/lib/database';
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
  const cardBg = colorScheme === 'dark' ? '#1c1c1e' : '#f2f2f7';
  const borderColor = colorScheme === 'dark' ? '#2c2c2e' : '#e5e5ea';

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [recentFoods, setRecentFoods] = useState<Food[]>([]);
  const [frequentFoods, setFrequentFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([getRecentFoods(8), getFrequentFoods(8)]).then(([recent, frequent]) => {
      setRecentFoods(recent);
      setFrequentFoods(frequent);
    });
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      searchFoods(query).then((foods) => {
        setResults(foods);
        setLoading(false);
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const slotLabel = SLOT_LABELS[meal_slot ?? ''] ?? 'Meal';

  const selectFood = (food: Food) => {
    router.replace({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pathname: '/serving-picker' as any,
      params: { food_id: food.id, meal_slot, date },
    });
  };

  const renderFood = (food: Food) => (
    <TouchableOpacity
      key={food.id}
      style={[styles.foodItem, { borderBottomColor: borderColor }]}
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
        <Text style={[styles.chip, { color: '#e74c3c' }]}>P {food.protein}g</Text>
        <Text style={[styles.chip, { color: '#f39c12' }]}>C {food.carbs}g</Text>
        <Text style={[styles.chip, { color: '#3498db' }]}>F {food.fat}g</Text>
      </View>
    </TouchableOpacity>
  );

  const showSuggestions = !query.trim();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn}>
          <Text style={[styles.cancelText, { color: colors.tint }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Add to {slotLabel}</Text>
        <View style={styles.cancelBtn} />
      </View>

      <View style={[styles.searchBar, { backgroundColor: cardBg }]}>
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
        {loading && <ActivityIndicator size="small" color={colors.tint} />}
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
        </ScrollView>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => renderFood(item)}
          ListEmptyComponent={
            !loading ? (
              <Text style={[styles.emptyText, { color: colors.icon }]}>
                No results for "{query}"
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
});
