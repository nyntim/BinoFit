import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getDefaultLogStatus,
  resolveDefaultLogStatus,
  setDefaultLogStatus,
} from '@/lib/storage';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('resolveDefaultLogStatus', () => {
  it('maps "planned" to planned', () => {
    expect(resolveDefaultLogStatus('planned')).toBe('planned');
  });
  it('maps null (fresh install) to eaten', () => {
    expect(resolveDefaultLogStatus(null)).toBe('eaten');
  });
  it('maps "eaten" to eaten', () => {
    expect(resolveDefaultLogStatus('eaten')).toBe('eaten');
  });
  it.each(['', 'Planned', 'true', 'undefined', '{}'])('maps garbage %j to eaten', (v) => {
    expect(resolveDefaultLogStatus(v)).toBe('eaten');
  });
});

describe('get/setDefaultLogStatus', () => {
  it('defaults to eaten on a fresh install', async () => {
    expect(await getDefaultLogStatus()).toBe('eaten');
  });
  it('round-trips planned', async () => {
    await setDefaultLogStatus('planned');
    expect(await getDefaultLogStatus()).toBe('planned');
  });
  it('round-trips back to eaten', async () => {
    await setDefaultLogStatus('planned');
    await setDefaultLogStatus('eaten');
    expect(await getDefaultLogStatus()).toBe('eaten');
  });
  it('falls back to eaten when the stored value is corrupt', async () => {
    await AsyncStorage.setItem('default_log_status', 'bogus');
    expect(await getDefaultLogStatus()).toBe('eaten');
  });
});
