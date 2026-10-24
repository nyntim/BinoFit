import { convertStatsDraft, statsDraftFrom, targetsSummary, validateStats, type StatsOriginal } from '@/lib/onboarding-setup';
import { weightRangeMessage } from '@/lib/weight';
import type { UserProfile } from '@/lib/types';

const profile = (over: Partial<UserProfile> = {}): UserProfile => ({
  weight: null, height: null, activity_level: null, updated_at: '2026-01-01T00:00:00.000Z', ...over,
});

function originalFor(p: UserProfile | null, kg: number | null, unit: 'lb' | 'kg'): StatsOriginal {
  return { profile: p, draft: statsDraftFrom(p, kg, unit, null), weightKg: kg };
}

describe('targetsSummary', () => {
  test('splits calories into percents and adds up the macro energy', () => {
    const s = targetsSummary({ calories: '2250', protein: '169', carbs: '253', fat: '63' });
    expect([s.macros.protein.percentOfCalories, s.macros.carbs.percentOfCalories, s.macros.fat.percentOfCalories]).toEqual([30, 45, 25]);
    expect(s.macroCalories).toBe(2255);
    expect(s.barLabel).toBe('Protein 30 percent, carbs 45 percent, fat 25 percent');
  });

  test('percents do not have to sum to 100', () => {
    const over = targetsSummary({ calories: '1000', protein: '200', carbs: '200', fat: '100' });
    const sum = over.macros.protein.percentOfCalories! + over.macros.carbs.percentOfCalories! + over.macros.fat.percentOfCalories!;
    expect(sum).toBeGreaterThan(100);
    const under = targetsSummary({ calories: '4000', protein: '50', carbs: '50', fat: '20' });
    expect(under.macros.protein.percentOfCalories! + under.macros.carbs.percentOfCalories! + under.macros.fat.percentOfCalories!).toBeLessThan(100);
  });

  test('no percents without calories', () => {
    for (const calories of ['0', '', 'abc']) {
      const s = targetsSummary({ calories, protein: '100', carbs: '100', fat: '50' });
      expect(s.macros.protein.percentOfCalories).toBeNull();
    }
  });

  test('blank, non-numeric and negative grams count as 0 and all zero gives no shares', () => {
    const s = targetsSummary({ calories: '2000', protein: '', carbs: 'abc', fat: '-5' });
    expect(s.macros.protein.grams).toBe(0);
    expect(s.macros.carbs.grams).toBe(0);
    expect(s.macros.fat.grams).toBe(0);
    expect(s.energyShares).toBeNull();
    expect(s.barLabel).toBe('No macros entered');
    expect(s.macroCalories).toBe(0);
  });
});

describe('validateStats', () => {
  test('unchanged weight keeps the saved kg at the limits in lb', () => {
    for (const kg of [20, 400]) {
      const o = originalFor(null, kg, 'lb');
      const r = validateStats(o.draft, o, 'lb');
      expect(r).toMatchObject({ ok: true, weightKg: kg, weightChanged: false });
    }
  });

  test('changed weight out of range returns the range message', () => {
    const o = originalFor(null, 70, 'kg');
    const r = validateStats({ ...o.draft, weight: '5' }, o, 'kg');
    expect(r).toEqual({ ok: false, field: 'weight', message: weightRangeMessage('kg') });
  });

  test('a changed valid weight is marked changed', () => {
    const o = originalFor(null, null, 'kg');
    expect(validateStats({ ...o.draft, weight: '75' }, o, 'kg')).toMatchObject({ ok: true, weightKg: 75, weightChanged: true });
  });

  test.each(['0', '-1', 'abc'])('metric height %s is rejected', (h) => {
    const o = originalFor(null, null, 'kg');
    expect(validateStats({ ...o.draft, heightCm: h }, o, 'kg')).toEqual({ ok: false, field: 'height', message: 'Enter a positive height in cm.' });
  });

  test('empty height is null', () => {
    const o = originalFor(null, null, 'kg');
    expect(validateStats(o.draft, o, 'kg')).toMatchObject({ ok: true, heightCm: null });
    const i = originalFor(null, null, 'lb');
    expect(validateStats(i.draft, i, 'lb')).toMatchObject({ ok: true, heightCm: null });
  });

  test('imperial height converts and rejects bad input', () => {
    const o = originalFor(null, null, 'lb');
    const ok = validateStats({ ...o.draft, feet: '5', inches: '10' }, o, 'lb');
    expect(ok.ok && ok.heightCm).toBeCloseTo(177.8, 5);
    const msg = 'Use whole feet and inches from 0 to less than 12.';
    expect(validateStats({ ...o.draft, feet: '5', inches: '12' }, o, 'lb')).toEqual({ ok: false, field: 'height', message: msg });
    expect(validateStats({ ...o.draft, feet: '5.5', inches: '0' }, o, 'lb')).toEqual({ ok: false, field: 'height', message: msg });
    expect(validateStats({ ...o.draft, feet: '0', inches: '0' }, o, 'lb')).toEqual({
      ok: false, field: 'height', message: 'Enter a positive height in feet and inches.',
    });
  });

  test('unchanged imperial height returns the stored cm exactly', () => {
    const o = originalFor(profile({ height: 179.123456 }), null, 'lb');
    expect(validateStats(o.draft, o, 'lb')).toMatchObject({ ok: true, heightCm: 179.123456, heightChanged: false });
  });
});

describe('convertStatsDraft', () => {
  test('an unchanged weight round-trips to the original display strings', () => {
    const o = originalFor(profile({ height: 180 }), 80, 'lb');
    const toKg = convertStatsDraft(o.draft, o, 'lb', 'kg');
    expect(toKg.draft.weight).toBe('80');
    expect(toKg.original.draft.weight).toBe('80');
    const back = convertStatsDraft(toKg.draft, toKg.original, 'kg', 'lb');
    expect(back.draft.weight).toBe(o.draft.weight);
    expect(validateStats(back.draft, back.original, 'lb')).toMatchObject({ weightChanged: false, weightKg: 80 });
  });

  test('a typed weight converts and stays changed', () => {
    const o = originalFor(null, null, 'lb');
    const r = convertStatsDraft({ ...o.draft, weight: '165' }, o, 'lb', 'kg');
    expect(r.draft.weight).toBe('74.84');
    expect(validateStats(r.draft, r.original, 'kg')).toMatchObject({ ok: true, weightChanged: true });
  });

  test('unparseable text is kept', () => {
    const o = originalFor(null, null, 'lb');
    expect(convertStatsDraft({ ...o.draft, weight: '16x' }, o, 'lb', 'kg').draft.weight).toBe('16x');
  });

  test('typed cm becomes feet and inches', () => {
    const o = originalFor(null, null, 'kg');
    const r = convertStatsDraft({ ...o.draft, heightCm: '177.8' }, o, 'kg', 'lb');
    expect(r.draft.feet).toBe('5');
    expect(r.draft.inches).toBe('10');
  });

  test('typed feet and inches become cm', () => {
    const o = originalFor(null, null, 'lb');
    const r = convertStatsDraft({ ...o.draft, feet: '5', inches: '10' }, o, 'lb', 'kg');
    expect(r.draft.heightCm).toBe('177.8');
  });
});
