import { normalizeVolumeTargets, parseVolumeTarget, volumeTargetProgress } from '@/lib/workouts/targets';

test.each(['-1', '1.5', '1e1', 'NaN', 'sets', '41', 'Infinity'])('rejects invalid input %s', value => {
  expect(() => parseVolumeTarget(value)).toThrow();
});
test('accepts boundary values and clears blank or zero', () => {
  expect(['1', '40', '', '0', '  '].map(parseVolumeTarget)).toEqual([1, 40, null, null, null]);
});
test.each([null, undefined, [], 'bad', 12])('normalizes malformed stored maps %s', value => {
  expect(normalizeVolumeTargets(value)).toEqual({});
});
test('normalizes only eligible integer targets', () => {
  expect(normalizeVolumeTargets({ Chest: 12, Quads: 0, Lats: '10', Glutes: 1.2, Biceps: 41, Cardio: 10, All: 10, Unknown: 10 })).toEqual({ Chest: 12 });
});
test('merges under, met, over and zero target rows in count then region order', () => {
  expect(volumeTargetProgress([{ region: 'Quads', sets: 10 }, { region: 'Chest', sets: 10 }, { region: 'Cardio', sets: 2 }], { Quads: 8, Chest: 10, Lats: 12, Cardio: 10 })).toEqual([
    { region: 'Chest', sets: 10, target: 10, status: 'met' },
    { region: 'Quads', sets: 10, target: 8, status: 'over' },
    { region: 'Cardio', sets: 2, target: null, status: 'none' },
    { region: 'Lats', sets: 0, target: 12, status: 'under' },
  ]);
  expect(volumeTargetProgress([], { Lats: 0 })).toEqual([]);
  expect(volumeTargetProgress([{ region: 'Chest', sets: 8 }], { Chest: 12 })[0].status).toBe('under');
});
test('empty targets retain count-only behavior', () => {
  expect(volumeTargetProgress([{ region: 'Chest', sets: 8 }], {})).toEqual([{ region: 'Chest', sets: 8, target: null, status: 'none' }]);
});
