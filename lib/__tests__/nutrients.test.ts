import { NUTRIENTS, NUTRIENT_IDS, normalizeNutrients, scaleNutrients } from '@/lib/nutrients';

test('catalog has thirty unique stable IDs and canonical units', () => {
  expect(NUTRIENTS).toHaveLength(30);
  expect(new Set(NUTRIENT_IDS).size).toBe(30);
  expect(NUTRIENTS.find((n) => n.id === 'vitamin_a')).toMatchObject({ unit: 'ug', label: 'Vitamin A (RAE)' });
  expect(NUTRIENTS.find((n) => n.id === 'sodium')?.unit).toBe('mg');
});
test.each(NUTRIENT_IDS)('%s preserves unknown versus real zero', (id) => {
  expect(normalizeNutrients({ [id]: 0 })[id]).toBe(0);
  for (const invalid of [undefined, null, '', '  ', '2no', -1, NaN, Infinity, {}, true]) {
    expect(normalizeNutrients({ [id]: invalid })[id]).toBeNull();
  }
});
test('scaling preserves tiny values and rejects invalid or overflowing multipliers', () => {
  expect(scaleNutrients({ b12: .000001 }, .25).b12).toBe(.00000025);
  for (const scale of [NaN, Infinity, -1]) expect(scaleNutrients({ fiber: 2 }, scale).fiber).toBeNull();
  expect(scaleNutrients({ fiber: Number.MAX_VALUE }, 2).fiber).toBeNull();
});
