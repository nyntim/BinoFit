import { foodSourceLabel } from '@/lib/food-source';

test.each([
  ['usda', 'USDA'],
  ['usda_sr_legacy', 'USDA'],
  ['usda_foundation', 'USDA'],
  ['branded', 'Branded'],
  ['open_food_facts', 'Open Food Facts'],
  ['custom', 'Custom'],
])('%s maps to %s', (source, label) => {
  expect(foodSourceLabel(source)).toBe(label);
});

test.each([[null], [undefined], [''], ['mystery_source']])('%p gives no tag', (source) => {
  expect(foodSourceLabel(source)).toBeNull();
});
