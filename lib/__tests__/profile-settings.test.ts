import { profileDraft, validateProfileDraft } from '@/lib/profile-settings';
import { centimetresToFeetInches, feetInchesToCentimetres } from '@/lib/units';
const profile = { weight: 73.123456, height: 179.123456, activity_level: 'moderate' as const, updated_at: 'x' };
test.each(['kg', 'lb'] as const)('unchanged rounded %s fields preserve canonical values', unit => {
  const base = profileDraft(profile, profile.weight, unit);
  const parsed = validateProfileDraft(base, base, unit);
  expect(parsed.weightChanged).toBe(false);
  expect(parsed.heightChanged).toBe(false);
});
test('an activity change never flags the weight as changed', () => {
  const base = profileDraft(profile, profile.weight, 'lb');
  expect(validateProfileDraft({ ...base, activity: 'active' }, base, 'lb').weightChanged).toBe(false);
});
test.each(['NaN', 'Infinity', '-1', '170cm', '0', '301'])('rejects invalid metric height %s', height => {
  const base = profileDraft(profile, profile.weight, 'kg');
  expect(() => validateProfileDraft({ ...base, height }, base, 'kg')).toThrow();
});
test('accepts empty optional measurements and rejects invalid imperial inches', () => {
  const base = profileDraft(null, null, 'lb');
  expect(validateProfileDraft(base, base, 'lb')).toEqual(expect.objectContaining({ weightKg: null, heightCm: null, activity: null }));
  expect(() => validateProfileDraft({ ...base, feet: '5', inches: '12' }, base, 'lb')).toThrow();
});
test('imperial height converts to canonical centimetres', () => {
  expect(feetInchesToCentimetres(5, 10)).toBeCloseTo(177.8);
  expect(centimetresToFeetInches(177.8)).toEqual({ feet: 5, inches: 10 });
  expect(feetInchesToCentimetres(5, Infinity)).toBeNull();
});

test.each([20, 400])('unchanged rounded imperial boundary %s kg allows an activity edit', kg => {
  const base = profileDraft({ ...profile, weight: kg }, kg, 'lb');
  expect(validateProfileDraft({ ...base, activity: 'active' }, base, 'lb')).toEqual(expect.objectContaining({ weightChanged: false, activity: 'active' }));
  expect(() => validateProfileDraft({ ...base, weight: kg === 20 ? '44' : '882' }, base, 'lb')).toThrow();
});
