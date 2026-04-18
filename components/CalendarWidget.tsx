import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  StyleSheet,
} from 'react-native';
import { format, startOfWeek, addDays, parseISO } from 'date-fns';
import { Calendar } from 'react-native-calendars';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useDate } from '@/context/DateContext';
import { getLoggedDatesInRange, getLoggedDates } from '@/lib/database';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function CalendarWidget() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { selectedDate, setSelectedDate } = useDate();

  const [modalVisible, setModalVisible] = useState(false);
  const [weekDots, setWeekDots] = useState<Set<string>>(new Set());
  const [allLoggedDates, setAllLoggedDates] = useState<string[]>([]);

  const today = format(new Date(), 'yyyy-MM-dd');
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');

  const weekStart = startOfWeek(parseISO(selectedDate), { weekStartsOn: 1 });
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');

  const loadWeekDots = useCallback(async () => {
    try {
      const weekEnd = addDays(parseISO(weekStartStr), 6);
      const dates = await getLoggedDatesInRange(
        weekStartStr,
        format(weekEnd, 'yyyy-MM-dd')
      );
      setWeekDots(new Set(dates));
    } catch {
      setWeekDots(new Set());
    }
  }, [weekStartStr]);

  const loadAllDates = useCallback(async () => {
    try {
      const dates = await getLoggedDates();
      setAllLoggedDates(dates);
    } catch {
      setAllLoggedDates([]);
    }
  }, []);

  useEffect(() => {
    loadWeekDots();
  }, [loadWeekDots]);

  useEffect(() => {
    if (modalVisible) {
      loadAllDates();
    }
  }, [modalVisible, loadAllDates]);

  const handleWeekDayPress = (dateStr: string) => {
    if (dateStr > tomorrow) return;
    setSelectedDate(dateStr);
  };

  const handleCalendarDayPress = (dateStr: string) => {
    if (dateStr > tomorrow) return;
    setSelectedDate(dateStr);
    setModalVisible(false);
  };

  const markedDates: Record<string, object> = {};
  for (const date of allLoggedDates) {
    markedDates[date] = { marked: true, dotColor: colors.tint };
  }
  if (selectedDate in markedDates) {
    markedDates[selectedDate] = {
      ...(markedDates[selectedDate] as object),
      selected: true,
      selectedColor: colors.tint,
      dotColor: '#fff',
    };
  } else {
    markedDates[selectedDate] = { selected: true, selectedColor: colors.tint };
  }

  return (
    <View style={[styles.widgetContainer, { backgroundColor: colors.cardBackground, borderBottomColor: colors.separator }]}>
      <TouchableOpacity
        style={styles.weekStrip}
        onPress={() => setModalVisible(true)}
        activeOpacity={1}
      >
        {Array.from({ length: 7 }).map((_, i) => {
          const dayDate = addDays(weekStart, i);
          const dayStr = format(dayDate, 'yyyy-MM-dd');
          const isSelected = dayStr === selectedDate;
          const isToday = dayStr === today;
          const hasDot = weekDots.has(dayStr);
          const isFuture = dayStr > tomorrow;

          return (
            <TouchableOpacity
              key={dayStr}
              style={styles.dayCellWrapper}
              onPress={() => handleWeekDayPress(dayStr)}
              activeOpacity={0.7}
              disabled={isFuture}
            >
              <Text style={[
                styles.dayLabel,
                { color: isSelected ? colors.tint : colors.icon },
                isFuture && styles.dimmed,
              ]}>
                {DAY_LABELS[i]}
              </Text>
              <View style={[
                styles.dayCircle,
                isSelected && { backgroundColor: colors.tint },
                isToday && !isSelected && { borderWidth: 1.5, borderColor: colors.tint },
              ]}>
                <Text style={[
                  styles.dayNumber,
                  { color: isSelected ? '#fff' : isToday ? colors.tint : colors.text },
                  isFuture && styles.dimmed,
                ]}>
                  {format(dayDate, 'd')}
                </Text>
              </View>
              <View style={styles.dotRow}>
                {isToday && (
                  <View style={[
                    styles.todayDot,
                    { backgroundColor: isSelected ? 'rgba(255,255,255,0.85)' : colors.tint },
                  ]} />
                )}
                {hasDot && !isFuture && !isToday && (
                  <View style={[
                    styles.logDot,
                    { backgroundColor: isSelected ? 'rgba(255,255,255,0.6)' : colors.tint + 'CC' },
                  ]} />
                )}
                {hasDot && !isFuture && isToday && (
                  <View style={[
                    styles.logDot,
                    { backgroundColor: isSelected ? 'rgba(255,255,255,0.6)' : colors.tint + 'CC' },
                  ]} />
                )}
              </View>
            </TouchableOpacity>
          );
        })}
        <View style={styles.expandChevron}>
          <MaterialIcons name="keyboard-arrow-down" size={16} color={colors.icon} />
        </View>
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setModalVisible(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.cardBackground }]} onPress={() => {}}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.separator }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Date</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} hitSlop={12}>
                <MaterialIcons name="close" size={22} color={colors.icon} />
              </TouchableOpacity>
            </View>
            <Calendar
              current={selectedDate}
              maxDate={tomorrow}
              markedDates={markedDates}
              onDayPress={(day) => handleCalendarDayPress(day.dateString)}
              theme={{
                backgroundColor: colors.cardBackground,
                calendarBackground: colors.cardBackground,
                textSectionTitleColor: colors.icon,
                dayTextColor: colors.text,
                todayTextColor: colors.tint,
                selectedDayBackgroundColor: colors.tint,
                selectedDayTextColor: '#fff',
                dotColor: colors.tint,
                selectedDotColor: '#fff',
                arrowColor: colors.tint,
                monthTextColor: colors.text,
                textDisabledColor: colors.icon + '40',
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  widgetContainer: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  weekStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dayCellWrapper: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  dayLabel: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumber: {
    fontSize: 15,
    fontWeight: '600',
  },
  dotRow: {
    flexDirection: 'row',
    gap: 3,
    height: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  logDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  dimmed: {
    opacity: 0.3,
  },
  expandChevron: {
    paddingLeft: 4,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
});
