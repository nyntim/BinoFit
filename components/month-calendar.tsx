import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  format,
  addMonths,
  subMonths,
  parseISO,
  isSameMonth,
} from 'date-fns';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useThemeColor } from '@/hooks/use-theme-color';

type Props = {
  currentMonth: Date;
  /** yyyy-MM-dd dates that get a dot. */
  markedDates: string[];
  /** Local today, yyyy-MM-dd. Later days are disabled. */
  today: string;
  selectedDate?: string;
  /** First column: 0 = Sunday, 1 = Monday. */
  weekStartsOn?: 0 | 1;
  onDayPress: (date: string) => void;
  onMonthChange: (month: Date) => void;
};

const WEEKDAYS_SUNDAY_FIRST = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function MonthCalendar({
  currentMonth,
  markedDates,
  today,
  selectedDate,
  weekStartsOn = 0,
  onDayPress,
  onMonthChange,
}: Props) {
  const tint = useThemeColor({}, 'tint');
  const text = useThemeColor({}, 'text');
  const icon = useThemeColor({}, 'icon');

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const leadingBlanks = (getDay(startOfMonth(currentMonth)) - weekStartsOn + 7) % 7;
  const weekdays = [...WEEKDAYS_SUNDAY_FIRST.slice(weekStartsOn), ...WEEKDAYS_SUNDAY_FIRST.slice(0, weekStartsOn)];
  const markedSet = new Set(markedDates);
  const onCurrentMonth = isSameMonth(currentMonth, parseISO(today));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.chevron}
          onPress={() => onMonthChange(subMonths(currentMonth, 1))}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <MaterialIcons name="chevron-left" size={24} color={icon} />
        </TouchableOpacity>
        <Text style={[styles.monthLabel, { color: text }]} accessibilityRole="header">
          {format(currentMonth, 'MMMM yyyy')}
        </Text>
        <TouchableOpacity
          style={[styles.chevron, onCurrentMonth && styles.disabled]}
          onPress={() => onMonthChange(addMonths(currentMonth, 1))}
          disabled={onCurrentMonth}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          accessibilityState={{ disabled: onCurrentMonth }}
        >
          <MaterialIcons name="chevron-right" size={24} color={icon} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekRow}>
        {weekdays.map((d, i) => (
          <Text key={i} style={[styles.weekday, { color: icon }]}>{d}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <View key={`blank-${i}`} style={styles.cell} />
        ))}
        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isToday = dateStr === today;
          const future = dateStr > today;
          const marked = markedSet.has(dateStr);
          const selected = dateStr === selectedDate;
          const label =
            format(day, 'MMMM d') +
            (isToday ? ', today' : '') +
            (future ? '' : marked ? ', logged' : ', nothing logged');

          return (
            <TouchableOpacity
              key={dateStr}
              style={[styles.cell, future && styles.disabled]}
              onPress={() => onDayPress(dateStr)}
              disabled={future}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ disabled: future, selected }}
            >
              <View
                style={[
                  styles.dayCircle,
                  {
                    borderColor: isToday ? tint : 'transparent',
                    backgroundColor: selected && !isToday ? tint + '30' : 'transparent',
                  },
                ]}
              >
                <Text style={[styles.dayText, { color: text, fontWeight: isToday ? '600' : '400' }]}>
                  {format(day, 'd')}
                </Text>
              </View>
              <View style={[styles.dot, { backgroundColor: marked && !future ? tint : 'transparent' }]} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  chevron: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  monthLabel: { fontSize: 15, fontWeight: '600' },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '500' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center' },
  dayCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: { fontSize: 13, fontVariant: ['tabular-nums'] },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 1 },
});
