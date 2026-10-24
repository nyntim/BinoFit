import { Alert } from 'react-native';

const mockSave = jest.fn();
const mockStartLive = jest.fn();
const mockSync = jest.fn();
const mockPush = jest.fn();
jest.mock('@/lib/workouts/routines', () => ({
  saveWorkoutAsRoutine: (...a: unknown[]) => mockSave(...a),
  startLiveFromRoutine: (...a: unknown[]) => mockStartLive(...a),
}));
jest.mock('@/lib/sync', () => ({ syncToSupabase: () => mockSync() }));
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

import { saveAsRoutineWithFeedback, startRoutineWithFeedback } from '@/lib/workouts/routine-flow';

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('saveAsRoutineWithFeedback', () => {
  it('shows Nothing to save and does not sync when there are no sets', async () => {
    mockSave.mockResolvedValue(null);
    await saveAsRoutineWithFeedback('w1');
    expect(Alert.alert).toHaveBeenCalledWith('Nothing to save', 'This workout has no sets to copy.');
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('syncs, calls onSaved and offers View routine, which opens the routine', async () => {
    mockSave.mockResolvedValue({ id: 'r1', name: 'Push' });
    const onSaved = jest.fn();
    await saveAsRoutineWithFeedback('w1', { onSaved });
    expect(mockSave).toHaveBeenCalledWith('w1');
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith({ id: 'r1', name: 'Push' });
    const [title, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(title).toBe('Saved as Push.');
    expect(buttons.map((b: { text: string }) => b.text)).toEqual(['OK', 'View routine']);
    buttons[1].onPress();
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/workout/routine', params: { id: 'r1' } });
  });

  it('shows the error alert when saving throws', async () => {
    mockSave.mockRejectedValue(new Error('disk'));
    await saveAsRoutineWithFeedback('w1');
    expect(Alert.alert).toHaveBeenCalledWith('Couldn’t save the routine.', 'Try again.');
    expect(mockSync).not.toHaveBeenCalled();
  });
});

describe('startRoutineWithFeedback', () => {
  it('opens the session when the workout starts', async () => {
    mockStartLive.mockResolvedValue({ id: 'w1' });
    expect(await startRoutineWithFeedback('r1')).toBe('started');
    expect(mockStartLive).toHaveBeenCalledWith('r1', expect.any(Date));
    expect(mockPush).toHaveBeenCalledWith('/workout/session');
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('asks for an exercise when the routine is empty', async () => {
    mockStartLive.mockResolvedValue('empty');
    expect(await startRoutineWithFeedback('r1')).toBe('not-started');
    expect(Alert.alert).toHaveBeenCalledWith('Add an exercise first.');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('offers Resume when a workout is already active', async () => {
    mockStartLive.mockResolvedValue('active');
    expect(await startRoutineWithFeedback('r1')).toBe('not-started');
    const [title, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(title).toBe('A workout is already in progress.');
    expect(buttons.map((b: { text: string }) => b.text)).toEqual(['Cancel', 'Resume']);
    buttons[1].onPress();
    expect(mockPush).toHaveBeenCalledWith('/workout/session');
  });

  it('shows an error alert and never throws', async () => {
    mockStartLive.mockRejectedValue(new Error('disk'));
    expect(await startRoutineWithFeedback('r1')).toBe('not-started');
    expect(Alert.alert).toHaveBeenCalledWith('Couldn’t start the workout.', 'Try again.');
  });
});
