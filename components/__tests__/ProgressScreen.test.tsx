import { fireEvent, render, screen } from '@testing-library/react-native';
import ProgressScreen from '@/app/(tabs)/progress';

const mockPush = jest.fn();
const mockNavigate = jest.fn();
let mockProgress: Record<string, unknown>;

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, navigate: mockNavigate }) }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/context/TabBarInsetContext', () => ({ useTabBarInset: () => 0, useTabBarInsetMode: () => 'measured' }));
jest.mock('@/components/ui/icon-symbol', () => ({ IconSymbol: () => null }));
jest.mock('@/hooks/usePreferences', () => ({ usePreferences: () => ({ weightUnit: 'lb', appearance: 'light' }) }));
jest.mock('@/hooks/useProgress', () => ({ useProgress: () => mockProgress }));
jest.mock('@/hooks/useExpenditure', () => ({ useExpenditure: () => ({ status: 'ready', estimate: null, reload: jest.fn() }) }));
jest.mock('@/hooks/useWeightEntries', () => ({ useWeightEntries: () => ({ days: [], status: 'ready', reload: jest.fn() }) }));
jest.mock('@/lib/sync', () => ({ syncToSupabase: jest.fn() }));

const bounds = { start: '2026-10-11', end: '2026-10-17', days: 7 };

const base = () => ({
  loading: false,
  loadedRange: '7d',
  today: '2026-10-17',
  bounds,
  daily: [],
  summary: { averagedDays: 0, avg: null, loggedDays: 0, totalDays: 7 },
  buckets: [],
  unit: 'day',
  goals: null,
  loggedDates: [],
  trend: [],
  weeklyRateKg: null,
  trainedDates: [],
  trainingBounds: bounds,
  trainingUnit: 'day',
  workoutBuckets: [],
  workoutAverages: null,
  records: [],
  streaks: { currentStreak: 0, longestStreak: 0 },
  nothingEver: false,
});

beforeEach(() => {
  mockPush.mockClear();
  mockNavigate.mockClear();
  mockProgress = base();
});

describe('first run', () => {
  beforeEach(() => {
    mockProgress = { ...base(), nothingEver: true };
  });

  it('shows the empty state copy', async () => {
    await render(<ProgressScreen />);
    expect(screen.getByText('Your trends start here')).toBeTruthy();
    expect(
      screen.getByText('Log a few days of food or a workout and this page fills in. Weekly patterns show after 7 days.')
    ).toBeTruthy();
    expect(screen.queryByText('Nothing logged yet')).toBeNull();
  });

  it('Log food goes home through homeRouteFor', async () => {
    await render(<ProgressScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Log food' }));
    expect(mockNavigate).toHaveBeenCalledWith('/(tabs)');
  });

  it('Start a workout opens the session', async () => {
    await render(<ProgressScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Start a workout' }));
    expect(mockPush).toHaveBeenCalledWith('/workout/session');
  });

  it('hides the placeholder card from accessibility', async () => {
    await render(<ProgressScreen />);
    expect(screen.queryByText('Calories, daily average')).toBeNull();
    expect(screen.getByText('Calories, daily average', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('No average yet', { includeHiddenElements: true })).toBeTruthy();
  });
});

describe('with data', () => {
  it('renders the card headers in order', async () => {
    await render(<ProgressScreen />);
    const expected = [
      'Calories, daily average',
      'Macros, daily average',
      'Consistency',
      'Estimated expenditure',
      'Weight trend',
      'Training',
      'Recent records',
    ];
    const headers = screen.getAllByRole('header').map((h) => String(h.props.children));
    expect(headers.filter((h) => expected.includes(h))).toEqual(expected);
    expect(screen.getByText('Progress')).toBeTruthy();
  });
});
