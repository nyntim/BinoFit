import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  FlatList,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { MacroColors } from '@/constants/theme';
import type { Colors } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useScrollRestore } from '@/hooks/useScrollRestore';
import { useMealDefinitions } from '@/hooks/useMealDefinitions';
import { getRecentFoods, getFrequentFoods } from '@/lib/database';
import {
  searchLocal,
  searchBranded,
  shouldAutoFetchBranded,
  getFullBrandedFood,
  parseQuery,
  sortFoodResults,
  type SortOption,
} from '@/lib/food-service';
import type { Food } from '@/lib/types';

type DisplayRow =
  | { key: string; type: 'food'; food: Food }
  | { key: string; type: 'heading'; title: string }
  | { key: string; type: 'status'; status: 'suggestions-empty' | 'local-empty' | 'branded-empty' | 'branded-loading' }
  | { key: string; type: 'divider' };

const foodRows = (group: string, foods: Food[]): DisplayRow[] =>
  foods.map((food) => ({ key: `${group}:${food.id}`, type: 'food', food }));
const rowKey = (row: DisplayRow) => row.key;

const SORT_LABELS: Record<SortOption, string> = {
  best: 'Best Match',
  frequent: 'Frequent',
  recent: 'Recent',
  az: 'A → Z',
  za: 'Z → A',
};

function SortControl({
  active,
  onSelect,
  colors,
}: {
  active: SortOption;
  onSelect: (opt: SortOption) => void;
  colors: Pick<typeof Colors.light, 'background' | 'cardBackground' | 'separator' | 'text' | 'tint'>;
}) {
  return (
    <View style={styles.sortContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortScroll}>
        {(Object.keys(SORT_LABELS) as SortOption[]).map((opt) => (
          <TouchableOpacity
            key={opt}
            onPress={() => onSelect(opt)}
            style={[
              styles.sortPill,
              { backgroundColor: active === opt ? colors.tint : colors.cardBackground },
              active === opt ? null : { borderWidth: 1, borderColor: colors.separator },
            ]}
          >
            <Text style={[styles.sortText, { color: active === opt ? colors.background : colors.text }]}>
              {SORT_LABELS[opt]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

export default function FoodSearchScreen() {
  const { meal_slot, date } = useLocalSearchParams<{ meal_slot: string; date: string }>();
  const router = useRouter();
  const { labelFor, loaded: mealsLoaded } = useMealDefinitions();
  const background = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const icon = useThemeColor({}, 'icon');
  const separator = useThemeColor({}, 'separator');
  const text = useThemeColor({}, 'text');
  const tint = useThemeColor({}, 'tint');
  const colors = { background, cardBackground, icon, separator, text, tint };

  const [query, setQuery] = useState('');
  const [localResults, setLocalResults] = useState<Food[]>([]);
  const [brandedResults, setBrandedResults] = useState<Food[]>([]);
  const [recentFoods, setRecentFoods] = useState<Food[]>([]);
  const [frequentFoods, setFrequentFoods] = useState<Food[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [brandedLoading, setBrandedLoading] = useState(false);
  const [brandedRequested, setBrandedRequested] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>('best');
  const [parsedQuantity, setParsedQuantity] = useState<{ amount: number; unit: string } | null>(null);

  const searchIdRef = useRef(0);
  const showSuggestions = !query.trim();

  const suggestionsScrollRef = useRef<FlatList<DisplayRow>>(null);
  const resultsScrollRef = useRef<FlatList<DisplayRow>>(null);
  const restoreSuggestions = useCallback((offset: number) => {
    if (!suggestionsScrollRef.current) return false;
    suggestionsScrollRef.current.scrollToOffset({ offset, animated: false });
    return true;
  }, []);
  const restoreResults = useCallback((offset: number) => {
    if (!resultsScrollRef.current) return false;
    resultsScrollRef.current.scrollToOffset({ offset, animated: false });
    return true;
  }, []);
  const suggestionsRestore = useScrollRestore('food-search-suggestions', restoreSuggestions, showSuggestions);
  const resultsRestore = useScrollRestore('food-search-results', restoreResults, !showSuggestions);

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
      setParsedQuantity(null);
      return;
    }

    setLocalLoading(true);
    setBrandedResults([]);
    setBrandedRequested(false);

    const id = ++searchIdRef.current;

    const timer = setTimeout(async () => {
      const parsed = parseQuery(trimmed);
      if (parsed.quantity) {
        setParsedQuantity({ amount: parsed.quantity, unit: parsed.unit || '' });
      } else {
        setParsedQuantity(null);
      }

      const local = await searchLocal(parsed.term);
      if (id !== searchIdRef.current) return;

      const sorted = await sortFoodResults(local, sortOption);
      setLocalResults(sorted);
      setLocalLoading(false);

      if (shouldAutoFetchBranded(local.length)) {
        setBrandedRequested(true);
        fetchBranded(parsed.term, local.map((f) => f.id), id);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, fetchBranded, sortOption]);

  const handleLoadBranded = () => {
    setBrandedRequested(true);
    const parsed = parseQuery(query);
    fetchBranded(parsed.term, localResults.map((f) => f.id), searchIdRef.current);
  };

  const slotLabel = mealsLoaded ? labelFor(meal_slot, date) : '';

  const selectFood = async (food: Food) => {
    if (selecting) return;
    setSelecting(true);
    try {
      if (
        food.source === 'branded' ||
        (!food.source?.startsWith('usda') &&
          !food.source?.startsWith('custom') &&
          food.source !== 'open_food_facts' &&
          food.brand)
      ) {
        await getFullBrandedFood(food.id);
      }
      router.replace({
        pathname: '/serving-picker' as any,
        params: { 
          food_id: food.id, 
          meal_slot, 
          date,
          initial_amount: parsedQuantity ? String(parsedQuantity.amount) : undefined
        },
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
          {food.serving_units} · {food.calories} cal
        </Text>
      </View>
      <View style={styles.macroChips}>
        <Text style={[styles.chip, { color: MacroColors.protein }]}>P {food.protein}g</Text>
        <Text style={[styles.chip, { color: MacroColors.carbs }]}>C {food.carbs}g</Text>
        <Text style={[styles.chip, { color: MacroColors.fat }]}>F {food.fat}g</Text>
      </View>
    </TouchableOpacity>
  );

  const showBrandedButton =
    !showSuggestions &&
    !brandedRequested &&
    localResults.length >= 8 &&
    query.trim().length >= 3;

  const suggestionRows = useMemo<DisplayRow[]>(() => {
    const rows: DisplayRow[] = [];
    if (recentFoods.length) rows.push({ key: 'recent:heading', type: 'heading', title: 'RECENT' }, ...foodRows('recent', recentFoods));
    if (frequentFoods.length) rows.push({ key: 'frequent:heading', type: 'heading', title: 'FREQUENT' }, ...foodRows('frequent', frequentFoods));
    if (!rows.length) rows.push({ key: 'suggestions:empty', type: 'status', status: 'suggestions-empty' });
    return rows;
  }, [recentFoods, frequentFoods]);
  const resultRows = useMemo<DisplayRow[]>(() => {
    const rows = foodRows('local', localResults);
    if (!localResults.length && !localLoading) rows.push({ key: 'local:empty', type: 'status', status: 'local-empty' });
    if (brandedRequested) {
      rows.push({ key: 'branded:divider', type: 'divider' }, { key: 'branded:heading', type: 'heading', title: 'BRANDED' });
      if (brandedLoading) rows.push({ key: 'branded:loading', type: 'status', status: 'branded-loading' });
      else if (!brandedResults.length) rows.push({ key: 'branded:empty', type: 'status', status: 'branded-empty' });
      rows.push(...foodRows('branded', brandedResults));
    }
    return rows;
  }, [localResults, localLoading, brandedRequested, brandedLoading, brandedResults]);
  const renderRow = ({ item }: { item: DisplayRow }) => {
    if (item.type === 'food') return renderFood(item.food);
    if (item.type === 'heading') return <Text style={[styles.sectionTitle, { color: colors.icon }]}>{item.title}</Text>;
    if (item.type === 'divider') return <View style={[styles.divider, { backgroundColor: colors.separator }]} />;
    if (item.status === 'branded-loading') return <ActivityIndicator size="small" color={colors.tint} style={styles.brandedSpinner} />;
    if (item.status === 'local-empty') return (
      <View style={styles.emptyState}>
        <Text style={[styles.emptyText, { color: colors.icon }]}>No results for &quot;{query}&quot;</Text>
        <Text style={[styles.emptyHint, { color: colors.icon }]}>Try different words or check the spelling</Text>
      </View>
    );
    return <Text style={[item.status === 'suggestions-empty' ? styles.emptyText : styles.emptyHint, { color: colors.icon }]}>
      {item.status === 'suggestions-empty' ? 'Search for a food to get started' : 'No branded results found'}
    </Text>;
  };
  const footer = (
    <>
      {showBrandedButton && (
        <TouchableOpacity style={[styles.loadBrandedBtn, { borderColor: colors.tint + '50' }]} onPress={handleLoadBranded} activeOpacity={0.7} disabled={brandedLoading}>
          <Text style={[styles.loadBrandedText, { color: colors.tint }]}>{brandedLoading ? 'Loading branded foods...' : 'Load branded foods'}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={[styles.createFoodBtn, { borderColor: colors.tint + '50' }]}
        onPress={() => router.replace({ pathname: '/custom-food' as any, params: { meal_slot, date } })}
        activeOpacity={0.7}
      >
        <Text style={[styles.createFoodText, { color: colors.tint }]}>+ Create custom food</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn}>
          <Text style={[styles.cancelText, { color: colors.tint }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{mealsLoaded ? `Add to ${slotLabel}` : ''}</Text>
        <View style={styles.cancelBtn} />
      </View>

      <View style={styles.searchToolbar}>
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
        {Platform.OS !== 'web' && (
          <View style={[styles.scanSurface, { backgroundColor: colors.cardBackground }]}>
            <TouchableOpacity
              onPress={() =>
                router.replace({
                  pathname: '/barcode-scanner' as any,
                  params: { meal_slot, date },
                })
              }
              style={styles.scanBtn}
              accessibilityRole="button"
              accessibilityLabel="Scan barcode"
            >
              <MaterialIcons name="qr-code-scanner" size={22} color={colors.tint} />
            </TouchableOpacity>
          </View>
        )}
      </View>
      {parsedQuantity && (
        <View style={styles.quantityHint}>
          <MaterialIcons name="info-outline" size={14} color={colors.tint} />
          <Text style={[styles.quantityHintText, { color: colors.tint }]}>
            Logging {parsedQuantity.amount}{parsedQuantity.unit} of...
          </Text>
        </View>
      )}

      {!showSuggestions && (
        <SortControl
          active={sortOption}
          onSelect={setSortOption}
          colors={colors}
        />
      )}

      {showSuggestions ? (
        <FlatList
          key="suggestions"
          ref={suggestionsScrollRef}
          style={styles.list}
          data={suggestionRows}
          renderItem={renderRow}
          keyExtractor={rowKey}
          ListFooterComponent={footer}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={7}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onLayout={suggestionsRestore.onLayout}
          onScroll={suggestionsRestore.onScroll}
          onContentSizeChange={suggestionsRestore.onContentSizeChange}
        />
      ) : (
        <FlatList
          key="results"
          ref={resultsScrollRef}
          style={styles.list}
          data={resultRows}
          renderItem={renderRow}
          keyExtractor={rowKey}
          ListFooterComponent={footer}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={7}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.resultsScroll}
          scrollEventThrottle={16}
          onLayout={resultsRestore.onLayout}
          onScroll={resultsRestore.onScroll}
          onContentSizeChange={resultsRestore.onContentSizeChange}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cancelBtn: { width: 64, minHeight: 44, justifyContent: 'center' },
  cancelText: { fontSize: 16 },
  title: { fontSize: 17, fontWeight: '600' },
  searchToolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8 },
  scanSurface: { borderRadius: 12 },
  scanBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  searchBar: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
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
  sortContainer: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent',
  },
  sortScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  sortPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortText: {
    fontSize: 13,
    fontWeight: '500',
  },
  quantityHint: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 4,
  },
  quantityHintText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
