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
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation, usePreventRemove } from 'expo-router/react-navigation';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { MacroColors } from '@/constants/theme';
import type { Colors } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { useScrollRestore } from '@/hooks/useScrollRestore';
import { useMealDefinitions } from '@/hooks/useMealDefinitions';
import { getRecentFoods, getFrequentFoods } from '@/lib/database';
import {
  searchLocal,
  searchBranded,
  getFullBrandedFood,
  parseQuery,
  sortFoodResults,
  type SortOption,
} from '@/lib/food-service';
import { FoodSearchSession } from '@/lib/food-search-session';
import { supabase } from '@/lib/supabase';
import { needsRemoteDetails } from '@/lib/food-resolve';
import { foodSourceLabel } from '@/lib/food-source';
import type { Food } from '@/lib/types';
import { SelectionBar } from '@/components/food-search/SelectionBar';
import { SelectionCheck } from '@/components/food-search/SelectionCheck';
import { useFoodSelection } from '@/hooks/useFoodSelection';
import { isSelected, selectedCount } from '@/lib/food-selection';
import {
  beginFoodSelection,
  clearSelectedFoods,
  endFoodSelection,
  getFoodSelection,
  toggleSelectedFood,
} from '@/lib/food-selection-store';

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
  const [remoteError, setRemoteError] = useState(false);
  const [rawLocal, setRawLocal] = useState<Food[]>([]);
  const [rawRemote, setRawRemote] = useState<Food[]>([]);
  const sessionRef = useRef<FoodSearchSession | null>(null);
  const sortGeneration = useRef(0);
  const suggestionGeneration = useRef(0);
  const scrollWhenSorted = useRef(false);
  const [selecting, setSelecting] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>('best');
  const [parsedQuantity, setParsedQuantity] = useState<{ amount: number; unit: string } | null>(null);

  // Multi-select: the draft lives in a module store so it survives queries, sorts and the review screen.
  const navigation = useNavigation();
  const [selectMode, setSelectMode] = useState(false);
  const selection = useFoodSelection();
  const pickedCount = selectedCount(selection);
  const selectedIdsKey = selection.order.join('|');
  useEffect(() => {
    beginFoodSelection({ meal_slot, date });
    return () => endFoodSelection();
  }, [meal_slot, date]);
  usePreventRemove(pickedCount > 0, ({ data }) => {
    const remaining = selectedCount(getFoodSelection());
    if (remaining === 0) {
      navigation.dispatch(data.action);
      return;
    }
    Alert.alert(`Discard ${remaining} ${remaining === 1 ? 'food' : 'foods'}?`, 'Your selected foods have not been added.', [
      { text: 'Keep selecting', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });
  const toggleSelectMode = () => {
    if (!selectMode) return setSelectMode(true);
    if (pickedCount === 0) return setSelectMode(false);
    Alert.alert('Discard selection?', `${pickedCount} selected ${pickedCount === 1 ? 'food' : 'foods'} will be cleared.`, [
      { text: 'Keep selecting', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => { clearSelectedFoods(); setSelectMode(false); } },
    ]);
  };
  const openReview = () => router.push({ pathname: '/food-batch-review' as any, params: { meal_slot, date } });

  const showSuggestions = !query.trim();

  const suggestionsScrollRef = useRef<FlatList<DisplayRow>>(null);
  const resultsScrollRef = useRef<FlatList<DisplayRow>>(null);
  const restoreSuggestions = useCallback((offset: number) => {
    if (!suggestionsScrollRef.current) return false;
    suggestionsScrollRef.current.scrollToOffset({ offset, animated: false });
    return true;
  }, []);
  const suggestionsRestore = useScrollRestore('food-search-suggestions', restoreSuggestions, showSuggestions);
  const keyboardHeight = useKeyboardHeight();
  const listPadding = { paddingBottom: 40 + keyboardHeight };

  useEffect(() => {
    const version = suggestionGeneration;
    const generation = ++version.current;
    Promise.all([getRecentFoods(8), getFrequentFoods(8)]).then(([recent, frequent]) => {
      if (generation !== version.current) return;
      setRecentFoods(recent);
      setFrequentFoods(frequent);
    }).catch(() => {});
    return () => { version.current++; };
  }, []);

  useEffect(() => {
    const session = new FoodSearchSession({
      local: searchLocal,
      remote: (q, signal, current) => searchBranded(q, [], { signal, current }),
      changed: state => {
        setRawLocal(state.local); setRawRemote(state.remote);
        setLocalLoading(state.localLoading); setBrandedLoading(state.remoteLoading);
        setBrandedRequested(state.requested); setRemoteError(state.error);
      },
    });
    sessionRef.current = session;
    let account: string | null | undefined;
    const { data } = supabase.auth.onAuthStateChange((event, authSession) => {
      const nextAccount = authSession?.user.id ?? null;
      if (event === 'SIGNED_OUT' || (account !== undefined && account !== nextAccount)) {
        sortGeneration.current++;
        suggestionGeneration.current++;
        setRecentFoods([]); setFrequentFoods([]);
        session.reset();
        setQuery(''); setLocalResults([]); setBrandedResults([]);
      }
      account = nextAccount;
    });
    const sortVersion = sortGeneration;
    return () => { sortVersion.current++; session.dispose(); sessionRef.current = null; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const generation = ++sortGeneration.current;
    if (localLoading) return;
    const ids = new Set(rawLocal.map(food => food.id));
    Promise.all([sortFoodResults(rawLocal, sortOption), sortFoodResults(rawRemote.filter(food => !ids.has(food.id)), sortOption)])
      .then(([local, remote]) => {
        if (generation !== sortGeneration.current) return;
        setLocalResults(local); setBrandedResults(remote);
        if (scrollWhenSorted.current) {
          resultsScrollRef.current?.scrollToOffset({ offset: 0, animated: false });
          scrollWhenSorted.current = false;
        }
      });
  }, [rawLocal, rawRemote, sortOption, localLoading]);

  const handleQueryChange = (next: string) => {
    sortGeneration.current++;
    scrollWhenSorted.current = true;
    resultsScrollRef.current?.scrollToOffset({ offset: 0, animated: false });
    setLocalResults([]); setBrandedResults([]);
    const parsed = parseQuery(next);
    setParsedQuantity(parsed.quantity ? { amount: parsed.quantity, unit: parsed.unit || '' } : null);
    sessionRef.current?.change(parsed.tokens.join(' '));
    setQuery(next);
  };

  const handleLoadBranded = () => { void sessionRef.current?.lookup(true); };

  const slotLabel = mealsLoaded ? labelFor(meal_slot, date) : '';

  const selectFood = async (food: Food) => {
    if (selecting) return;
    setSelecting(true);
    try {
      if (needsRemoteDetails(food)) {
        await getFullBrandedFood(food.id);
      }
      router.push({
        pathname: '/serving-picker' as any,
        params: {
          food_id: food.id,
          meal_slot,
          date,
          origin: 'search',
          initial_amount: parsedQuantity ? String(parsedQuantity.amount) : undefined
        },
      });
    } finally {
      setSelecting(false);
    }
  };

  const renderFood = (food: Food) => {
    const source = foodSourceLabel(food.source);
    const calories = Math.round(food.calories);
    const picked = selectMode && isSelected(selection, food.id);
    const label = [
      food.name,
      food.brand,
      `${calories} calories`,
      food.serving_units,
      `protein ${food.protein} grams`,
      `carbs ${food.carbs} grams`,
      `fat ${food.fat} grams`,
      source ? `source ${source}` : null,
    ].filter(Boolean).join(', ');
    return (
      <TouchableOpacity
        key={food.id}
        style={[styles.foodItem, { borderBottomColor: colors.separator }]}
        onPress={() => (selectMode ? toggleSelectedFood(food, parsedQuantity?.amount) : selectFood(food))}
        activeOpacity={0.7}
        disabled={selecting}
        accessibilityLabel={label}
        {...(selectMode
          ? { accessibilityRole: 'checkbox' as const, accessibilityState: { checked: picked, disabled: selecting } }
          : { accessibilityRole: 'button' as const, accessibilityState: { disabled: selecting } })}
      >
        {selectMode ? <SelectionCheck selected={picked} /> : null}
        <View style={styles.foodInfo}>
          <Text style={[styles.foodName, { color: colors.text }]} numberOfLines={2}>
            {food.name}
          </Text>
          {food.brand ? (
            <Text style={[styles.foodBrand, { color: colors.icon }]} numberOfLines={1}>
              {food.brand}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            {source ? (
              <View style={[styles.sourceTag, { backgroundColor: colors.cardBackground }]}>
                <Text style={[styles.sourceTagText, { color: colors.icon }]}>{source}</Text>
              </View>
            ) : null}
            <Text style={[styles.foodMeta, { color: colors.icon }]}>{food.serving_units}</Text>
            <Text style={[styles.chip, { color: MacroColors.protein }]}>P {food.protein}g</Text>
            <Text style={[styles.chip, { color: MacroColors.carbs }]}>C {food.carbs}g</Text>
            <Text style={[styles.chip, { color: MacroColors.fat }]}>F {food.fat}g</Text>
          </View>
        </View>
        <View style={styles.calorieCol}>
          <Text style={[styles.calorieValue, { color: colors.text }]} numberOfLines={1}>{calories}</Text>
          <Text style={[styles.calorieUnit, { color: colors.icon }]}>cal</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const showBrandedButton =
    !showSuggestions &&
    (!brandedRequested || remoteError) &&
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
    if (brandedLoading) rows.push({ key: 'branded:loading', type: 'status', status: 'branded-loading' });
    if (brandedResults.length) {
      rows.push({ key: 'branded:divider', type: 'divider' }, { key: 'branded:heading', type: 'heading', title: 'BRANDED' }, ...foodRows('branded', brandedResults));
    }
    if (!rawLocal.length && !rawRemote.length && !localLoading && !brandedLoading) rows.push({ key: 'search:empty', type: 'status', status: 'local-empty' });
    return rows;
  }, [localResults, localLoading, brandedLoading, brandedResults, rawLocal.length, rawRemote.length]);
  const renderRow = ({ item }: { item: DisplayRow }) => {
    if (item.type === 'food') return renderFood(item.food);
    if (item.type === 'heading') return <Text style={[styles.sectionTitle, { color: colors.icon }]}>{item.title}</Text>;
    if (item.type === 'divider') return <View style={[styles.divider, { backgroundColor: colors.separator }]} />;
    if (item.status === 'branded-loading') return <ActivityIndicator size="small" color={colors.tint} style={styles.brandedSpinner} />;
    if (item.status === 'local-empty') return (
      <View style={styles.emptyState}>
        <Text style={[styles.emptyText, { color: colors.icon }]}>No results for &quot;{query}&quot;</Text>
        <Text style={[styles.emptyHint, { color: colors.icon }]}>{remoteError ? 'Branded search is unavailable. Try again.' : 'Create a custom food or scan its barcode.'}</Text>
        {Platform.OS !== 'web' && <TouchableOpacity accessibilityRole="button" onPress={() => router.replace({ pathname: '/barcode-scanner' as any, params: { meal_slot, date } })} style={styles.loadBrandedBtn}><Text style={[styles.loadBrandedText, { color: colors.tint }]}>Scan barcode</Text></TouchableOpacity>}
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
            onChangeText={handleQueryChange}
            onSubmitEditing={handleLoadBranded}
            accessibilityLabel="Search foods"
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
        <TouchableOpacity
          onPress={toggleSelectMode}
          style={[styles.selectBtn, { backgroundColor: selectMode ? colors.tint : colors.cardBackground }]}
          accessibilityRole="button"
          accessibilityLabel="Select multiple"
          accessibilityState={{ selected: selectMode }}
        >
          <MaterialIcons name="checklist" size={22} color={selectMode ? colors.background : colors.tint} />
        </TouchableOpacity>
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
          onSelect={option => { if (option === sortOption) return; scrollWhenSorted.current = true; sortGeneration.current++; setSortOption(option); }}
          colors={colors}
        />
      )}

      <KeyboardAvoidingView style={styles.list} enabled={selectMode} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {showSuggestions ? (
        <FlatList
          key="suggestions"
          ref={suggestionsScrollRef}
          style={styles.list}
          data={suggestionRows}
          extraData={selectedIdsKey}
          renderItem={renderRow}
          keyExtractor={rowKey}
          ListFooterComponent={footer}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={7}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={listPadding}
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
          extraData={selectedIdsKey}
          renderItem={renderRow}
          keyExtractor={rowKey}
          ListFooterComponent={footer}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={7}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={listPadding}
        />
      )}
      {selectMode ? <SelectionBar count={pickedCount} onClear={clearSelectedFoods} onReview={openReview} /> : null}
      </KeyboardAvoidingView>
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
  selectBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
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
  foodItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  foodInfo: { flex: 1, marginRight: 12 },
  foodName: { fontSize: 15, fontWeight: '400' },
  foodBrand: { fontSize: 13, marginTop: 1 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 2, marginTop: 4 },
  foodMeta: { fontSize: 13 },
  chip: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  sourceTag: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  sourceTagText: { fontSize: 11, fontWeight: '600' },
  calorieCol: { flexShrink: 0, minWidth: 56, alignItems: 'flex-end' },
  calorieValue: { fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  calorieUnit: { fontSize: 12 },
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
