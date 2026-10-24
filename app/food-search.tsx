import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Pressable,
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
import { format, isValid, parseISO } from 'date-fns';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { SearchField } from '@/components/ui/SearchField';
import { Tag } from '@/components/ui/Tag';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { useScrollRestore } from '@/hooks/useScrollRestore';
import { useMealDefinitions } from '@/hooks/useMealDefinitions';
import { useNewFoodStatus } from '@/hooks/useNewFoodStatus';
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
import type { Food, MealSlot } from '@/lib/types';
import { SelectionBar } from '@/components/food-search/SelectionBar';
import { SelectionCheck } from '@/components/food-search/SelectionCheck';
import { useFoodSelection } from '@/hooks/useFoodSelection';
import { batchTotals, isSelected, selectedCount } from '@/lib/food-selection';
import {
  beginFoodSelection,
  clearSelectedFoods,
  endFoodSelection,
  getFoodSelection,
  toggleSelectedFood,
} from '@/lib/food-selection-store';

type RowPosition = 'first' | 'middle' | 'last' | 'only';
type DisplayRow =
  | { key: string; type: 'food'; food: Food; position: RowPosition }
  | { key: string; type: 'heading'; title: string }
  | { key: string; type: 'status'; status: 'suggestions-empty' | 'local-empty' | 'branded-empty' | 'branded-loading' }
  | { key: string; type: 'divider' };

const foodRows = (group: string, foods: Food[]): DisplayRow[] =>
  foods.map((food, index) => ({
    key: `${group}:${food.id}`,
    type: 'food',
    food,
    position: foods.length === 1 ? 'only' : index === 0 ? 'first' : index === foods.length - 1 ? 'last' : 'middle',
  }));
const rowKey = (row: DisplayRow) => row.key;

const SORT_LABELS: Record<SortOption, string> = {
  best: 'Best match',
  recent: 'Recent',
  frequent: 'Frequent',
  az: 'A → Z',
  za: 'Z → A',
};

function SortControl({ active, onSelect }: { active: SortOption; onSelect: (opt: SortOption) => void }) {
  return (
    <View style={styles.sortContainer} accessibilityRole="radiogroup" accessibilityLabel="Sort">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortScroll}>
        {(Object.keys(SORT_LABELS) as SortOption[]).map((opt) => (
          <Chip key={opt} role="radio" surface="card" label={SORT_LABELS[opt]} selected={active === opt} onPress={() => onSelect(opt)} />
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
  const cardSecondary = useThemeColor({}, 'cardSecondary');
  const tintSoft = useThemeColor({}, 'tintSoft');
  const icon = useThemeColor({}, 'icon');
  const separator = useThemeColor({}, 'separator');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'onTint');
  const newStatus = useNewFoodStatus(date, meal_slot as MealSlot | undefined);

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
  const [barHeight, setBarHeight] = useState(72);
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

  const renderFood = (food: Food, position: RowPosition) => {
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
    const first = position === 'first' || position === 'only';
    const last = position === 'last' || position === 'only';
    return (
      <Pressable
        key={food.id}
        style={[
          styles.foodItem,
          { backgroundColor: picked ? tintSoft : cardBackground, borderTopColor: separator },
          first ? styles.groupFirst : { borderTopWidth: StyleSheet.hairlineWidth },
          last && styles.groupLast,
        ]}
        onPress={() => (selectMode ? toggleSelectedFood(food, parsedQuantity?.amount) : selectFood(food))}
        disabled={selecting}
        accessibilityLabel={label}
        {...(selectMode
          ? { accessibilityRole: 'checkbox' as const, accessibilityState: { checked: picked, disabled: selecting } }
          : { accessibilityRole: 'button' as const, accessibilityState: { disabled: selecting } })}
      >
        {selectMode ? <SelectionCheck selected={picked} /> : null}
        <View style={styles.foodInfo}>
          <ThemedText type="body" numberOfLines={2}>{food.name}</ThemedText>
          <View style={styles.metaRow}>
            {source ? <Tag label={source} /> : null}
            <ThemedText type="caption" style={styles.metaText}>
              {[food.brand, food.serving_units].filter(Boolean).join(' · ')}
            </ThemedText>
          </View>
        </View>
        <View style={styles.calorieCol}>
          <ThemedText type="body" style={styles.calorieValue} numberOfLines={1}>{calories}</ThemedText>
          <ThemedText type="caption">cal</ThemedText>
        </View>
      </Pressable>
    );
  };

  // A failed branded lookup shows a Retry bar instead of the Load button; local results still work
  const showFailureBar = remoteError && !showSuggestions;
  const showBrandedButton =
    !showSuggestions &&
    (!brandedRequested || remoteError) &&
    query.trim().length >= 3 &&
    !showFailureBar;

  const suggestionRows = useMemo<DisplayRow[]>(() => {
    const rows: DisplayRow[] = [];
    if (recentFoods.length) rows.push({ key: 'recent:heading', type: 'heading', title: 'Recent' }, ...foodRows('recent', recentFoods));
    if (frequentFoods.length) rows.push({ key: 'frequent:heading', type: 'heading', title: 'Frequent' }, ...foodRows('frequent', frequentFoods));
    if (!rows.length) rows.push({ key: 'suggestions:empty', type: 'status', status: 'suggestions-empty' });
    return rows;
  }, [recentFoods, frequentFoods]);
  const resultRows = useMemo<DisplayRow[]>(() => {
    const rows = foodRows('local', localResults);
    if (brandedLoading) rows.push({ key: 'branded:loading', type: 'status', status: 'branded-loading' });
    if (brandedResults.length) {
      rows.push({ key: 'branded:divider', type: 'divider' }, { key: 'branded:heading', type: 'heading', title: 'Branded foods' }, ...foodRows('branded', brandedResults));
    }
    if (!rawLocal.length && !rawRemote.length && !localLoading && !brandedLoading) rows.push({ key: 'search:empty', type: 'status', status: 'local-empty' });
    return rows;
  }, [localResults, localLoading, brandedLoading, brandedResults, rawLocal.length, rawRemote.length]);
  const renderRow = ({ item }: { item: DisplayRow }) => {
    if (item.type === 'food') return renderFood(item.food, item.position);
    if (item.type === 'heading') return <ThemedText type="section" style={styles.sectionTitle}>{item.title}</ThemedText>;
    if (item.type === 'divider') return <View style={styles.divider} />;
    if (item.status === 'branded-loading') return (
      <View style={styles.brandedLoading}>
        <ActivityIndicator size="small" color={tint} />
        <ThemedText type="caption">Searching branded foods…</ThemedText>
      </View>
    );
    if (item.status === 'local-empty') return (
      <EmptyState
        style={styles.emptyState}
        title="No matches yet"
        body={`Nothing for "${query}". Try fewer words, or add it yourself once and it'll be here next time.`}
        actions={
          <>
            <Button
              size="lg"
              label={`Create "${query.trim()}"`}
              onPress={() => router.replace({ pathname: '/custom-food' as any, params: { meal_slot, date, name: query.trim() } })}
            />
            {Platform.OS !== 'web' && (
              <Button
                size="lg"
                variant="secondary"
                label="Scan a barcode"
                onPress={() => router.replace({ pathname: '/barcode-scanner' as any, params: { meal_slot, date } })}
              />
            )}
          </>
        }
      />
    );
    return <ThemedText type={item.status === 'suggestions-empty' ? 'body' : 'caption'} style={styles.statusText}>
      {item.status === 'suggestions-empty' ? 'Search for a food to get started' : 'No branded results found'}
    </ThemedText>;
  };
  const footer = (
    <View style={styles.footer}>
      {showFailureBar && (
        <View style={[styles.failureBar, { backgroundColor: cardSecondary }]}>
          <IconSymbol name="icloud.slash" size={20} color={icon} />
          <ThemedText type="label" style={styles.failureText}>Branded foods couldn’t load. Local results still work.</ThemedText>
          <Button label="Retry" variant="ghost" size="sm" onPress={handleLoadBranded} />
        </View>
      )}
      {showBrandedButton && (
        <Button
          variant="secondary"
          size="lg"
          label={brandedLoading ? 'Loading branded foods…' : 'Load branded foods'}
          disabled={brandedLoading}
          onPress={handleLoadBranded}
        />
      )}
      <Button
        variant="secondary"
        size="lg"
        label="+ Create custom food"
        style={styles.createFood}
        onPress={() => router.replace({ pathname: '/custom-food' as any, params: { meal_slot, date } })}
      />
    </View>
  );

  const listPadding = { paddingBottom: 40 + keyboardHeight + (selectMode ? barHeight + 16 : 0) };
  const dateLine = [date && isValid(parseISO(date)) ? format(parseISO(date), 'EEE d MMM') : null, newStatus === 'eaten' ? 'Eaten' : newStatus === 'planned' ? 'Planned' : null].filter(Boolean).join(' · ');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      <View style={styles.header}>
        <View style={styles.headerSide}>
          {selectMode ? (
            <Button variant="ghost" label="Cancel" accessibilityLabel="Cancel selection" onPress={toggleSelectMode} />
          ) : (
            <Button variant="ghost" label="Cancel" onPress={() => router.back()} />
          )}
        </View>
        <View style={styles.headerCenter}>
          {selectMode ? (
            <ThemedText type="title" accessibilityRole="header" numberOfLines={1}>{`${pickedCount} selected`}</ThemedText>
          ) : (
            <>
              <ThemedText type="title" accessibilityRole="header" numberOfLines={1}>{mealsLoaded ? `Add to ${slotLabel}` : ''}</ThemedText>
              {mealsLoaded && dateLine ? <ThemedText type="caption" numberOfLines={1}>{dateLine}</ThemedText> : null}
            </>
          )}
        </View>
        <View style={[styles.headerSide, styles.headerEnd]}>
          {selectMode ? (
            <Button variant="ghost" label="Clear" accessibilityLabel="Clear selection" disabled={pickedCount === 0} onPress={clearSelectedFoods} />
          ) : (
            <Button variant="ghost" label="Select" accessibilityLabel="Select multiple" onPress={toggleSelectMode} />
          )}
        </View>
      </View>

      <View style={styles.searchToolbar}>
        <SearchField
          containerStyle={styles.searchField}
          placeholder="Search foods…"
          value={query}
          onChangeText={handleQueryChange}
          onSubmitEditing={handleLoadBranded}
          accessibilityLabel="Search foods"
          autoFocus
        />
        {(localLoading || brandedLoading || selecting) && <ActivityIndicator size="small" color={tint} />}
        {Platform.OS !== 'web' && (
          <Pressable
            onPress={() =>
              router.replace({
                pathname: '/barcode-scanner' as any,
                params: { meal_slot, date },
              })
            }
            style={[styles.scanBtn, { backgroundColor: tint }]}
            accessibilityRole="button"
            accessibilityLabel="Scan barcode"
          >
            <MaterialIcons name="qr-code-scanner" size={22} color={onTint} />
          </Pressable>
        )}
      </View>
      {parsedQuantity && (
        <View style={styles.quantityHint}>
          <ThemedText type="caption" style={{ color: tint }}>
            Logging {parsedQuantity.amount}{parsedQuantity.unit} of...
          </ThemedText>
        </View>
      )}

      {!showSuggestions && (
        <SortControl
          active={sortOption}
          onSelect={option => { if (option === sortOption) return; scrollWhenSorted.current = true; sortGeneration.current++; setSortOption(option); }}
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
      {selectMode ? <SelectionBar count={pickedCount} totals={batchTotals(selection)} onReview={openReview} onLayout={(event) => setBarHeight(event.nativeEvent.layout.height)} /> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 4 },
  headerSide: { minWidth: 84 },
  headerEnd: { alignItems: 'flex-end' },
  headerCenter: { flex: 1, alignItems: 'center', minWidth: 0 },
  searchToolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8 },
  searchField: { flex: 1 },
  scanBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6 },
  foodItem: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, paddingHorizontal: 16, paddingVertical: 12, minHeight: 56 },
  groupFirst: { borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  groupLast: { borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  foodInfo: { flex: 1, marginRight: 12, gap: 4 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 2 },
  metaText: { flexShrink: 1 },
  calorieCol: { flexShrink: 0, minWidth: 48, alignItems: 'flex-end' },
  calorieValue: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  emptyState: { marginTop: 32, paddingHorizontal: 24 },
  statusText: { textAlign: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  divider: { height: 8 },
  brandedLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  footer: { marginHorizontal: 16, marginTop: 16, marginBottom: 32, gap: 12 },
  failureBar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderRadius: 14, paddingVertical: 8, paddingLeft: 14, paddingRight: 6 },
  failureText: { flex: 1, minWidth: 140 },
  createFood: { borderStyle: 'dashed' },
  sortContainer: { paddingVertical: 8 },
  sortScroll: { paddingHorizontal: 16, gap: 8 },
  quantityHint: { paddingHorizontal: 16, paddingBottom: 8 },
});
