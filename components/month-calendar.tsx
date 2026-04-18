import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  format,
  addMonths,
  subMonths,
  isToday,
} from 'date-fns';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

type Props = {
  currentMonth: Date;
  markedDates: string[];
  selectedDate: string;
  tintColor: string;
  textColor: string;
  subTextColor: string;
  onDayPress: (date: string) => void;
  onMonthChange: (month: Date) => void;
};

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function MonthCalendar({
  currentMonth,
  markedDates,
  selectedDate,
  tintColor,
  textColor,
  subTextColor,
  onDayPress,
  onMonthChange,
}: Props) {
  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const leadingBlanks = getDay(startOfMonth(currentMonth));
  const markedSet = new Set(markedDates);

  return (
    <View style={styles.container}>
      {/* Month header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => onMonthChange(subMonths(currentMonth, 1))} hitSlop={HIT}>
          <MaterialIcons name="chevron-left" size={24} color={subTextColor} />
        </TouchableOpacity>
        <Text style={[styles.monthLabel, { color: textColor }]}>
          {format(currentMonth, 'MMMM yyyy')}
        </Text>
        <TouchableOpacity onPress={() => onMonthChange(addMonths(currentMonth, 1))} hitSlop={HIT}>
          <MaterialIcons name="chevron-right" size={24} color={subTextColor} />
        </TouchableOpacity>
      </View>

      {/* Weekday labels */}
      <View style={styles.weekRow}>
        {WEEKDAYS.map((d) => (
          <Text key={d} style={[styles.weekday, { color: subTextColor }]}>{d}</Text>
        ))}
      </View>

      {/* Day grid */}
      <View style={styles.grid}>
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <View key={`blank-${i}`} style={styles.cell} />
        ))}
        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const today = isToday(day);
          const selected = dateStr === selectedDate;
          const marked = markedSet.has(dateStr);
          const isSelected = selected && !today;

          return (
            <TouchableOpacity
              key={dateStr}
              style={[
                styles.cell,
                today && { backgroundColor: tintColor, borderRadius: 20 },
                isSelected && { backgroundColor: tintColor + '30', borderRadius: 20 },
              ]}
              onPress={() => onDayPress(dateStr)}
              activeOpacity={0.6}
            >
              <Text
                style={[
                  styles.dayText,
                  { color: today ? '#fff' : textColor },
                ]}
              >
                {format(day, 'd')}
              </Text>
              {marked && !today && (
                <View style={[styles.dot, { backgroundColor: tintColor }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

const styles = StyleSheet.create({
  container: { paddingHorizontal: 4, paddingBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  monthLabel: { fontSize: 15, fontWeight: '600' },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '500' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 14, fontWeight: '400' },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
});
