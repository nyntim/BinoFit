import { fireEvent, render, screen } from '@testing-library/react-native';
import { addDays, format, subDays } from 'date-fns';
import { CalorieTrendChart } from '@/components/progress/CalorieTrendChart';
import { ConsistencyCard } from '@/components/progress/ConsistencyCard';
import { WeightCard } from '@/components/progress/WeightCard';
import { WorkoutsChart } from '@/components/progress/WorkoutsChart';
import { enumerateDates, type Bucket } from '@/lib/progress';
import type { TrainingBucket } from '@/lib/workouts/progress';
import { formatShortDate } from '@/lib/workouts/format';
import type { WeightEntry } from '@/lib/types';

let mockWeightDays: WeightEntry[] = [];

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('@/components/ui/icon-symbol', () => ({ IconSymbol: () => null }));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: () => null }));
jest.mock('@/hooks/usePreferences', () => ({ usePreferences: () => ({ weightUnit: 'lb', appearance: 'light' }) }));
jest.mock('@/hooks/useWeightEntries', () => ({
  useWeightEntries: () => ({ days: mockWeightDays, status: 'ready', reload: jest.fn() }),
}));
jest.mock('@/lib/sync', () => ({ syncToSupabase: jest.fn() }));
jest.mock('@/lib/weight', () => ({
  ...jest.requireActual('@/lib/weight'),
  saveWeightEntry: jest.fn(),
  deleteWeightEntriesForDate: jest.fn(),
}));

const TODAY = '2026-10-17';

function dailyBuckets(): Bucket[] {
  return enumerateDates('2026-09-18', TODAY).map((date) => ({
    key: date,
    start: date,
    end: date,
    unit: 'day' as const,
    calories: 2000,
    hasData: true,
    isCurrent: date === TODAY,
  }));
}

function weeklyBuckets(): Bucket[] {
  return ['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'].map((date) => ({
    key: date,
    start: date,
    end: format(addDays(new Date(date + 'T00:00:00'), 6), 'yyyy-MM-dd'),
    unit: 'week' as const,
    calories: 2000,
    hasData: true,
    isCurrent: date === '2026-10-12',
  }));
}

const summary = {
  averagedDays: 26,
  avg: { calories: 2080, protein: 100, carbs: 200, fat: 60 },
  loggedDays: 26,
  totalDays: 30,
};

const chartProps = {
  range: '30d' as const,
  unit: 'day' as const,
  buckets: dailyBuckets(),
  summary,
  calorieGoal: 2250,
  rangeStart: '2026-09-18',
  onOpenDay: jest.fn(),
};

describe('CalorieTrendChart', () => {
  beforeEach(() => chartProps.onOpenDay.mockClear());

  it('toggles the weight trend with a checkbox chip', async () => {
    const onToggleWeight = jest.fn();
    await render(<CalorieTrendChart {...chartProps} onToggleWeight={onToggleWeight} />);
    const chip = screen.getByRole('checkbox', { name: 'Show weight trend' });
    expect(chip.props.accessibilityState.checked).toBe(false);
    await fireEvent.press(chip);
    expect(onToggleWeight).toHaveBeenCalledWith(true);
  });

  it('reports the chip as checked when the weight trend is on', async () => {
    await render(<CalorieTrendChart {...chartProps} showWeight onToggleWeight={jest.fn()} trend={[]} />);
    expect(screen.getByRole('checkbox', { name: 'Show weight trend' }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByText('The weight line needs 2 trend points.')).toBeTruthy();
  });

  it('shows the average, caption and goal label', async () => {
    await render(<CalorieTrendChart {...chartProps} />);
    expect(screen.getByText('Calories, daily average')).toBeTruthy();
    expect(screen.getByLabelText('2,080 calories a day on average')).toBeTruthy();
    expect(screen.getByText('26 logged days in the last 30 days, today excluded')).toBeTruthy();
    expect(screen.getByText('Goal 2,250', { includeHiddenElements: true })).toBeTruthy();
  });

  it('leaves out the goal label without a goal or an average', async () => {
    const { rerender } = await render(<CalorieTrendChart {...chartProps} calorieGoal={null} />);
    expect(screen.queryByText('Goal 2,250', { includeHiddenElements: true })).toBeNull();
    await rerender(<CalorieTrendChart {...chartProps} summary={{ ...summary, avg: null, averagedDays: 0 }} />);
    expect(screen.queryByText(/^Goal/, { includeHiddenElements: true })).toBeNull();
    expect(screen.getByText('No average yet')).toBeTruthy();
    expect(screen.getByText('No meals logged in the last 30 days, today excluded')).toBeTruthy();
  });

  it('describes the chart for screen readers', async () => {
    const { rerender } = await render(<CalorieTrendChart {...chartProps} />);
    expect(
      screen.getByLabelText('Daily calories for the last 30 days, average 2,080 against a 2,250 goal')
    ).toBeTruthy();
    await rerender(<CalorieTrendChart {...chartProps} calorieGoal={null} />);
    expect(screen.getByLabelText('Daily calories for the last 30 days, average 2,080')).toBeTruthy();
  });

  it('opens the day for a daily bar', async () => {
    await render(<CalorieTrendChart {...chartProps} />);
    await fireEvent.press(screen.getByRole('button', { name: /^Thu 15 Oct/ }));
    expect(chartProps.onOpenDay).toHaveBeenCalledWith('2026-10-15');
  });

  it('only selects a weekly bar', async () => {
    await render(
      <CalorieTrendChart {...chartProps} unit="week" buckets={weeklyBuckets()} />
    );
    const bar = screen.getByRole('button', { name: /^Week of 5 Oct/ });
    await fireEvent.press(bar);
    expect(chartProps.onOpenDay).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^Week of 5 Oct/ }).props.accessibilityState.selected).toBe(true);
    expect(screen.queryByRole('button', { name: /^View day/ })).toBeNull();
  });
});

describe('ConsistencyCard', () => {
  const props = {
    summary,
    streaks: { currentStreak: 6, longestStreak: 21 },
    loggedDates: ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'],
    today: TODAY,
    rangeStart: '2026-09-18',
    onDayPress: jest.fn(),
  };
  beforeEach(() => props.onDayPress.mockClear());

  it('labels the streak tiles and the day grid', async () => {
    await render(<ConsistencyCard {...props} />);
    expect(screen.getByLabelText('Current streak, 6 days')).toBeTruthy();
    expect(screen.getByLabelText('Longest streak, 21 days')).toBeTruthy();
    expect(screen.getByLabelText('Logged 26 of 30 days')).toBeTruthy();
    expect(screen.getByLabelText('6 of the last 30 days logged, current streak 6 days')).toBeTruthy();
  });

  it('notes the 90 day cap only when the range is longer', async () => {
    const { rerender } = await render(<ConsistencyCard {...props} />);
    expect(screen.queryByText('Showing the last 90 days')).toBeNull();
    await rerender(<ConsistencyCard {...props} rangeStart="2026-01-01" />);
    expect(screen.getByText('Showing the last 90 days')).toBeTruthy();
    expect(screen.getByLabelText(/^6 of the last 90 days logged/)).toBeTruthy();
  });

  it('keeps the month calendar: browsing and day taps', async () => {
    await render(<ConsistencyCard {...props} />);
    expect(screen.getByText('October 2026')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'October 16, logged' }));
    expect(props.onDayPress).toHaveBeenCalledWith('2026-10-16');
    expect(screen.getByRole('button', { name: 'October 20' }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByText('September 2026')).toBeTruthy();
  });
});

describe('WeightCard', () => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const entry = (daysAgo: number, kg: number, source: WeightEntry['source']): WeightEntry => {
    const date = format(subDays(new Date(), daysAgo), 'yyyy-MM-dd');
    return {
      id: `w${daysAgo}`,
      date,
      weight_kg: kg,
      measured_at: `${date}T08:00:00.000Z`,
      source,
      created_at: `${date}T08:00:00.000Z`,
      updated_at: `${date}T08:00:00.000Z`,
    };
  };

  beforeEach(() => {
    mockWeightDays = [entry(0, 78.2, 'manual'), entry(1, 78.5, 'healthkit'), entry(7, 79.4, 'manual'), entry(14, 80.3, 'manual')];
  });

  it('shows the trend value and the change chip', async () => {
    await render(<WeightCard range="30d" today={today} />);
    expect(screen.getByText('Weight trend')).toBeTruthy();
    expect(screen.getByLabelText(/^Weight trend \d+(\.\d+)? lb$/)).toBeTruthy();
    expect(screen.getByText(/^− ?\d+(\.\d+)? lb in 14 days$/)).toBeTruthy();
    expect(screen.getByLabelText(/^minus ?\d+(\.\d+)? lb in 14 days$/)).toBeTruthy();
  });

  it('lists recent entries with their source', async () => {
    await render(<WeightCard range="30d" today={today} />);
    expect(screen.getByLabelText('Today, 172.4 lb, Logged. Edit')).toBeTruthy();
    expect(screen.getByLabelText(`${formatShortDate(entry(1, 0, 'manual').date)}, 173.06 lb, Apple Health. Edit`)).toBeTruthy();
  });

  it('opens the sheet in edit mode titled with the date', async () => {
    await render(<WeightCard range="30d" today={today} />);
    const old = entry(7, 0, 'manual');
    await fireEvent.press(screen.getByRole('button', { name: new RegExp(`^${formatShortDate(old.date)}, .*Logged\\. Edit`) }));
    expect(screen.getByRole('header', { name: formatShortDate(old.date) })).toBeTruthy();
  });

  it('opens the sheet in log mode from Log weight', async () => {
    await render(<WeightCard range="30d" today={today} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Log weight' }));
    expect(screen.getByRole('header', { name: 'Log weight' })).toBeTruthy();
  });
});

describe('WorkoutsChart', () => {
  const buckets: TrainingBucket[] = ['2026-10-05', '2026-10-12'].map((key) => ({
    key,
    start: key,
    end: key,
    unit: 'week' as const,
    sessions: 3,
    volumeKg: 1000,
    hasData: true,
    isCurrent: key === '2026-10-12',
  }));
  const props = {
    range: '30d' as const,
    unit: 'week' as const,
    buckets,
    averages: { sessions: 6, sessionsPerWeek: 3, averageDurationSeconds: 3000 },
    rangeStart: '2026-09-18',
  };

  it('shows the two stats', async () => {
    await render(<WorkoutsChart {...props} />);
    expect(screen.getByText('Training')).toBeTruthy();
    expect(screen.getByText('sessions a week')).toBeTruthy();
    expect(screen.getByText('average session')).toBeTruthy();
    expect(screen.getByText('50 min')).toBeTruthy();
  });

  it('switches between Sessions and Volume', async () => {
    await render(<WorkoutsChart {...props} />);
    expect(screen.getByLabelText('Training metric')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Sessions' }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('Sessions per week: 3, and 3 so far')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Volume' }));
    expect(screen.getByRole('radio', { name: 'Volume' }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText(/^Volume per week, lb: /)).toBeTruthy();
  });
});
