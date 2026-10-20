import { ControlSurface } from '@/components/navigation/ControlSurface';
import { useCallback, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { addDays, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { Calendar } from 'react-native-calendars';
import type { DateData } from 'react-native-calendars';
import { useFocusEffect } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useDate } from '@/context/DateContext';
import { getLoggedDatesInRange } from '@/lib/database';
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

function DayLabel({ date, selected, today, disabled, food, trained, foodColor, trainingColor, textColor, tint, cardColor, onPress, weekday }: {
  date: string; selected: boolean; today: boolean; disabled: boolean; food: boolean; trained: boolean;
  foodColor: string; trainingColor: string; textColor: string; tint: string; cardColor: string;
  onPress: () => void; weekday?: string;
}) {
  const fullDate = format(parseISO(date), 'EEEE, MMMM d, yyyy');
  const label = [fullDate, today && 'today', food && 'food logged', trained && 'trained'].filter(Boolean).join(', ');
  return <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ selected, disabled }}
    style={[styles.dayCell, !weekday && styles.monthDayCell]}
  >
    {weekday && <Text style={[styles.weekday, { color: selected ? tint : textColor }, disabled && styles.dimmed]}>{weekday}</Text>}
    <View style={[styles.circle, selected && { backgroundColor: tint }, today && !selected && { borderWidth: 1.5, borderColor: tint }]}>
      <Text style={[styles.number, { color: selected ? cardColor : today ? tint : textColor }, disabled && styles.dimmed]}>{format(parseISO(date), 'd')}</Text>
    </View>
    <ActivityMarkers food={food} trained={trained} foodColor={foodColor} trainingColor={trainingColor} />
  </Pressable>;
}

export function CalendarWidget({ trainedDates = [], today = format(new Date(), 'yyyy-MM-dd'), foodRevision }: Props) {
  const { selectedDate, setSelectedDate } = useDate();
  const overlay = useThemeColor({}, 'overlay');
  const cardColor = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const separator = useThemeColor({}, 'separator');
  const [modalVisible, setModalVisible] = useState(false);
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
    setModalVisible(true);
  };
  const select = (date: string, close: boolean) => {
    if (date > maxPlanningDate) return;
    setSelectedDate(date);
    if (close) setModalVisible(false);
  };
  const dayProps = (date: string, food: boolean) => ({
    date, selected: date === selectedDate, today: date === today, disabled: date > maxPlanningDate,
    food, trained: date <= today && trained.has(date), foodColor: tint, trainingColor: textColor,
    textColor, tint, cardColor,
  });
  const legend = <View style={styles.legend}>
    <View style={styles.legendItem}><ActivityMarkers food trained={false} foodColor={tint} trainingColor={textColor} /><Text style={[styles.legendText, { color: muted }]}>Logged</Text></View>
    {showTrainingLegend && <View style={styles.legendItem}><ActivityMarkers food={false} trained foodColor={tint} trainingColor={textColor} /><Text style={[styles.legendText, { color: muted }]}>Trained</Text></View>}
  </View>;

  return <View style={[styles.container, { backgroundColor: cardColor, borderBottomColor: separator }]}>
    <View style={styles.weekRow}>
      {DAY_LABELS.map((weekday, i) => {
        const date = format(addDays(weekStart, i), 'yyyy-MM-dd');
        return <DayLabel key={date} {...dayProps(date, weekFood.has(date))} weekday={weekday} onPress={() => select(date, false)} />;
      })}
      <Pressable style={styles.expand} onPress={openMonth} accessibilityRole="button" accessibilityLabel="Open month calendar">
        <MaterialIcons name="keyboard-arrow-down" size={20} color={muted} />
      </Pressable>
    </View>
    {legend}
    <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
      <View style={[styles.backdrop, { backgroundColor: overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalVisible(false)} accessibilityLabel="Close calendar" />
        <View style={[styles.modalCard, { backgroundColor: cardColor }]}>
          <ControlSurface style={[styles.modalHeader, { borderBottomColor: separator }]}>
            <Text style={[styles.modalTitle, { color: textColor }]}>Select Date</Text>
            <Pressable style={styles.close} onPress={() => setModalVisible(false)} accessibilityRole="button" accessibilityLabel="Close calendar">
              <MaterialIcons name="close" size={22} color={muted} />
            </Pressable>
          </ControlSurface>
          <Calendar
            key={visibleMonth.slice(0, 7)}
            current={visibleMonth}
            firstDay={1}
            hideExtraDays={false}
            maxDate={maxPlanningDate}
            onMonthChange={(day: DateData) => setVisibleMonth(day.dateString.slice(0, 7) + '-01')}
            dayComponent={({ date }) => {
              if (!date) return null;
              return <DayLabel {...dayProps(date.dateString, monthFood.has(date.dateString))} onPress={() => select(date.dateString, true)} />;
            }}
            theme={{
              backgroundColor: cardColor, calendarBackground: cardColor, textSectionTitleColor: muted,
              dayTextColor: textColor, todayTextColor: tint, arrowColor: tint,
              monthTextColor: textColor, textDisabledColor: muted,
            }}
          />
          {legend}
        </View>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  container: { borderBottomWidth: StyleSheet.hairlineWidth },
  weekRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingTop: 8 },
  dayCell: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', gap: 3 },
  monthDayCell: { flex: 0, width: 44, minWidth: 44 },
  weekday: { fontSize: 11, fontWeight: '500', letterSpacing: 0.2 },
  circle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  number: { fontSize: 15, fontWeight: '600' },
  markers: { flexDirection: 'row', gap: 4, height: 4, alignItems: 'center' },
  markerSlot: { width: 4, height: 4, borderRadius: 2 },
  dimmed: { opacity: 0.3 },
  expand: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', gap: 18, justifyContent: 'center', paddingBottom: 9, paddingTop: 3 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontSize: 11 },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 20, paddingRight: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontSize: 17, fontWeight: '600' },
  close: { width: 44, height: 52, alignItems: 'center', justifyContent: 'center' },
});
