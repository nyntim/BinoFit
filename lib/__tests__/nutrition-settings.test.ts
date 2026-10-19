import { mergeValidGoalFields, parseGoalInput } from '@/lib/nutrition-settings';

describe('nutrition goal inputs', () => {
  test.each([
    ['1', 1], [' 2500 ', 2500], ['', null], [' ', null], ['0', null], ['-1', null],
    ['1.5', null], ['1e3', null], ['12abc', null], ['Infinity', null],
    ['9007199254740992', null],
  ])('parses %j as %j', (input, expected) => {
    expect(parseGoalInput(input)).toBe(expected);
  });

  test('valid fields update without replacing other persisted goals', () => {
    const base = { calorie_goal: 2000, protein_goal: 150, carb_goal: 200, fat_goal: 65 };
    expect(mergeValidGoalFields(base, {
      calorie_goal: '', protein_goal: '165', carb_goal: '-1', fat_goal: '65',
    })).toEqual({ ...base, protein_goal: 165 });
  });
});
