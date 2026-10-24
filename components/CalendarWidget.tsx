import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addDays, addMonths, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { Calendar } from 'react-native-calendars';
import type { DateData } from 'react-native-calendars';
import { useFocusEffect } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useDate } from '@/context/DateContext';
import { useDaySummary } from '@/hooks/useDaySummary';
import { getLoggedDatesInRange } from '@/lib/database';
import { daySummaryLine } from '@/lib/day-summary';
import { useThemeColor } from '@/hooks/use-theme-color';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type Props = { trainedDates?: string[]; today?: string; foodRevision?: unknown };

function ActivityMarkers({ food, trained, foodColor, trainingColor }: {
  food: boolean; trained: boolean; foodColor: string; trainingColor: string;
}) {
  return <View style={styles.markers}>
    <View style={[styles.markerSlot, food && { backgroundColor: foodColor }]} testID={food ? 'food-marker' : undefined} />
    <View style={[styles.markerSlot, trained && { backgroundColor: trainingColor }]} testID={trained ? 'training-marker' : undefined} />
  </View>;
}

function DayLabel({ date, selected, today, disabled, future, food, trained, foodColor, trainingColor, textColor, mutedColor, tint, onTint, onPress, weekday }: {
  date: string; selected: boolean; today: boolean; disabled: boolean; future: boolean; food: boolean; trained: boolean;
  foodColor: string; trainingColor: string; textColor: string; mutedColor: string; tint: string; onTint: string;
  onPress: () => void; weekday?: string;
}) {
  const fullDate = format(parseISO(date), 'EEEE, MMMM d, yyyy');
  const label = [fullDate, today && 'today', food && 'food logged', trained && 'trained'].filter(Boolean).join(', ');
  const numberColor = selected ? onTint : future ? mutedColor : textColor;
  return <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ selected, disabled }}
    style={[styles.dayCell, !weekday && styles.monthDayCell]}
  >
    {weekday && <Text style={[styles.weekday, { color: selected ? tint : mutedColor }, disabled && styles.dimmed]}>{weekday}</Text>}
    <View style={[styles.circle, !weekday && styles.monthCircle, selected && { backgroundColor: tint }, today && !selected && { borderWidth: 1.5, borderColor: tint }]}>
      <Text style={[styles.number, { color: numberColor }, disabled && styles.dimmed]}>{format(parseISO(date), 'd')}</Text>
    </View>
    <ActivityMarkers food={food} trained={trained} foodColor={foodColor} trainingColor={trainingColor} />
  </Pressable>;
}

export function CalendarWidget({ trainedDates = [], today = format(new Date(), 'yyyy-MM-dd'), foodRevision }: Props) {
  const { selectedDate, setSelectedDate } = useDate();
  const overlay = useThemeColor({}, 'overlay');
  const sheetBackground = useThemeColor({}, 'sheetBackground');
  const cardSecondary = useThemeColor({}, 'cardSecondary');
  const grabber = useThemeColor({}, 'fieldBorder');
  const textColor = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'onTint');
  const ember = useThemeColor({}, 'ember');
  const insets = useSafeAreaInsets();
  const [modalVisible, setModalVisible] = useState(false);
  const [previewDate, setPreviewDate] = useState(selectedDate);
  const summary = useDaySummary(modalVisible ? previewDate : null);
  const [visibleMonth, setVisibleMonth] = useState(selectedDate.slice(0, 7) + '-01');
  const [weekFood, setWeekFood] = useState<Set<string>>(new Set());
  const [monthFood, setMonthFood] = useState<Set<string>>(new Set());
  const weekRequest = useRef(0);
  const monthRequest = useRef(0);
  const trained = new Set(trainedDates);
  const showTrainingLegend = trainedDates.length > 0;
  const maxPlanningDate = format(addDays(parseISO(today), 7), 'yyyy-MM-dd');
  const weekStart = startOfWeek(parseISO(selectedDate), { weekStartsOn: 1 });
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');

  const loadWeek = useCallback(() => {
    void foodRevision;
    const request = ++weekRequest.current;
    setWeekFood(new Set());
    getLoggedDatesInRange(weekStartStr, format(addDays(parseISO(weekStartStr), 6), 'yyyy-MM-dd')).then(
      (dates) => { if (request === weekRequest.current) setWeekFood(new Set(dates)); },
      () => { if (request === weekRequest.current) setWeekFood(new Set()); }
    );
  }, [weekStartStr, foodRevision]);

  const loadMonth = useCallback(() => {
    if (!modalVisible) return;
    void foodRevision;
    const request = ++monthRequest.current;
    const start = startOfWeek(startOfMonth(parseISO(visibleMonth)), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(parseISO(visibleMonth)), { weekStartsOn: 1 });
    setMonthFood(new Set());
    getLoggedDatesInRange(format(start, 'yyyy-MM-dd'), format(end, 'yyyy-MM-dd')).then(
      (dates) => { if (request === monthRequest.current) setMonthFood(new Set(dates)); },
      () => { if (request === monthRequest.current) setMonthFood(new Set()); }
    );
  }, [visibleMonth, modalVisible, foodRevision]);

  useFocusEffect(useCallback(() => {
    loadWeek();
    loadMonth();
    return () => { weekRequest.current++; monthRequest.current++; };
  }, [loadWeek, loadMonth]));

  const openMonth = () => {
    setVisibleMonth(selectedDate.slice(0, 7) + '-01');
    setPreviewDate(selectedDate);
    setModalVisible(true);
  };
  // The week strip selects at once; the month sheet previews a day until "Go to day"
  const select = (date: string) => {
    if (date > maxPlanningDate) return;
    setSelectedDate(date);
  };
  const preview = (date: string) => {
    if (date > maxPlanningDate) return;
    setPreviewDate(date);
  };
  const goToDay = () => {
    if (previewDate > maxPlanningDate) return;
    setSelectedDate(previewDate);
    setModalVisible(false);
  };
  const dayProps = (date: string, food: boolean, selected: boolean) => ({
    date, selected, today: date === today, disabled: date > maxPlanningDate, future: date > today,
    food, trained: date <= today && trained.has(date), foodColor: tint, trainingColor: ember,
    textColor, mutedColor: muted, tint, onTint,
  });
  const nextMonth = addMonths(parseISO(visibleMonth), 1);
  const nextMonthDisabled = format(nextMonth, 'yyyy-MM-dd') > maxPlanningDate;
  const shiftMonth = (delta: 1 | -1) => setVisibleMonth(format(addMonths(parseISO(visibleMonth), delta), 'yyyy-MM-dd'));
  const legend = <View style={styles.legend}>
    <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: tint }]} /><Text style={[styles.legendText, { color: muted }]}>Logged food</Text></View>
    {showTrainingLegend && <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: ember }]} /><Text style={[styles.legendText, { color: muted }]}>Trained</Text></View>}
  </View>;
  const monthButton = (name: 'chevron.left' | 'chevron.right', label: string, onPress: () => void, disabled = false) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[styles.monthButton, disabled && styles.dimmed]}
    >
      <IconSymbol name={name} size={20} color={tint} />
    </Pressable>
  );

  return <View>
    <View style={styles.weekRow}>
      {DAY_LABELS.map((weekday, i) => {
        const date = format(addDays(weekStart, i), 'yyyy-MM-dd');
        return <DayLabel key={date} {...dayProps(date, weekFood.has(date), date === selectedDate)} weekday={weekday} onPress={() => select(date)} />;
      })}
      <Pressable style={styles.expand} onPress={openMonth} accessibilityRole="button" accessibilityLabel="Open month calendar">
        <View style={[styles.expandCircle, { backgroundColor: cardSecondary }]}>
          <IconSymbol name="chevron.down" size={20} color={muted} />
        </View>
      </Pressable>
    </View>
    <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
      <View style={[styles.backdrop, { backgroundColor: overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalVisible(false)} accessibilityRole="button" accessibilityLabel="Close calendar" />
        <View style={[styles.modalCard, { backgroundColor: sheetBackground, paddingBottom: 16 + insets.bottom }]}>
          <View style={[styles.grabber, { backgroundColor: grabber }]} accessible={false} importantForAccessibility="no" />
          <View style={styles.monthHeader}>
            {monthButton('chevron.left', 'Previous month', () => shiftMonth(-1))}
            <ThemedText type="stat" style={styles.monthTitle} accessibilityRole="header">{format(parseISO(visibleMonth), 'MMMM yyyy')}</ThemedText>
            {monthButton('chevron.right', 'Next month', () => shiftMonth(1), nextMonthDisabled)}
          </View>
          <Calendar
            key={visibleMonth.slice(0, 7)}
            current={visibleMonth}
            firstDay={1}
            hideExtraDays={false}
            hideArrows
            renderHeader={() => <View />}
            maxDate={maxPlanningDate}
            onMonthChange={(day: DateData) => setVisibleMonth(day.dateString.slice(0, 7) + '-01')}
            dayComponent={({ date }) => {
              if (!date) return null;
              return <DayLabel {...dayProps(date.dateString, monthFood.has(date.dateString), date.dateString === previewDate)} onPress={() => preview(date.dateString)} />;
            }}
            theme={{
              backgroundColor: sheetBackground, calendarBackground: sheetBackground, textSectionTitleColor: muted,
              dayTextColor: textColor, todayTextColor: tint, arrowColor: tint,
              monthTextColor: textColor, textDisabledColor: muted,
            }}
          />
          {legend}
          <View style={[styles.summary, { backgroundColor: cardSecondary }]}>
            <View style={styles.summaryCopy}>
              <ThemedText type="label" style={styles.summaryDate}>{format(parseISO(previewDate), 'EEE d MMM')}</ThemedText>
              {summary.loading ? (
                <ActivityIndicator size="small" color={tint} style={styles.summarySpinner} />
              ) : (
                <ThemedText type="caption">{daySummaryLine(summary.eatenCalories, summary.workouts)}</ThemedText>
              )}
            </View>
            <Button label="Go to day" size="sm" disabled={previewDate > maxPlanningDate} onPress={goToDay} />
          </View>
        </View>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  weekRow: { flexDirection: 'row', alignItems: 'center' },
  dayCell: { flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 3 },
  monthDayCell: { flex: 0, width: 44, minWidth: 44, minHeight: 50 },
  weekday: { fontSize: 11, fontWeight: '500', letterSpacing: 0.2 },
  circle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  monthCircle: { width: 34, height: 34, borderRadius: 17 },
  number: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  markers: { flexDirection: 'row', gap: 4, height: 5, alignItems: 'center' },
  markerSlot: { width: 5, height: 5, borderRadius: 3 },
  dimmed: { opacity: 0.3 },
  expand: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  expandCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', gap: 18, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 5, height: 5, borderRadius: 3 },
  legendText: { fontSize: 11 },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthTitle: { fontSize: 20, lineHeight: 24 },
  monthButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 12 },
  summaryCopy: { flex: 1, minWidth: 0, gap: 2 },
  summaryDate: { fontWeight: '600' },
  summarySpinner: { alignSelf: 'flex-start' },
});
