import { stepServingAmount } from '@/lib/food-validation';
import { parseFoodDecimal, validateServing, validateNutrient, servingMultiplier, formatServingAmount } from '@/lib/food-validation';

describe('strict food decimals', () => {
  test.each([['0', 0], [' 1,5 ', 1.5], ['.5', .5], ['1.', 1], ['10.25', 10.25]])('accepts %s completely', (raw, value) => {
    expect(parseFoodDecimal(raw as string, 'required')).toMatchObject({ valid: true, value });
  });
  test.each(['', '-5', '-0', '+5', '1e2', 'Infinity', 'NaN', '5g', '1.2.3', '1,2,3', '1,2.3', '.', '9'.repeat(400)])('rejects %s without sanitizing it', (raw) => {
    expect(parseFoodDecimal(raw, 'required').valid).toBe(false);
  });
  test('blank policies keep null and zero distinct', () => {
    expect(parseFoodDecimal(' ', 'zero')).toMatchObject({ valid: true, value: 0 });
    expect(parseFoodDecimal('', 'null')).toMatchObject({ valid: true, value: null });
    expect(validateNutrient('0', 'Calories', 'required')).toMatchObject({ valid: true, value: 0 });
    expect(validateNutrient('', 'Calories', 'required').valid).toBe(false);
    expect(validateNutrient('-1', 'Protein', 'zero').valid).toBe(false);
  });
});

describe('serving bounds and conversions', () => {
  test.each([['0', false], ['0.009', false], ['0.01', true], ['250', true], ['10000', true], ['10000.00001', false]])('validates %s grams', (raw, valid) => {
    expect(validateServing(raw as string, 'grams', 100).valid).toBe(valid);
  });
  test.each([null, 0, -1, Infinity, NaN])('invalid weight %s exposes only default servings', (base) => {
    expect(validateServing('100', 'default', base).valid).toBe(true);
    expect(validateServing('100.01', 'default', base).valid).toBe(false);
    expect(validateServing('1', 'grams', base).valid).toBe(false);
  });
  test('default bounds follow the actual base weight', () => {
    expect(validateServing('100', 'default', 100).valid).toBe(true);
    expect(validateServing('100.01', 'default', 100).valid).toBe(false);
    expect(validateServing('10000', 'default', 1).valid).toBe(true);
    expect(validateServing('10000.01', 'default', 1).valid).toBe(false);
  });
  test('grams, ounces and default preserve the same multiplier', () => {
    const grams = 250;
    for (const [raw, unit] of [['2.5', 'default'], ['250', 'grams'], [formatServingAmount(grams / 28.35), 'oz']] as const) {
      expect(validateServing(raw, unit, 100).multiplier).toBeCloseTo(2.5, 14);
    }
    expect(validateServing('8', 'oz', 100).valid).toBe(true);
  });
  test('mass boundary survives round trips and cannot be bypassed', () => {
    const ounces = 10000 / 28.35;
    expect(validateServing(formatServingAmount(ounces), 'oz', 100).valid).toBe(true);
    expect(validateServing(formatServingAmount(ounces + .00001), 'oz', 100).valid).toBe(false);
    const multiplier = servingMultiplier(ounces, 'oz', 100);
    expect(validateServing(formatServingAmount(multiplier), 'default', 100).valid).toBe(true);
  });
  test('a conversion below selected-unit minimum remains invalid', () => {
    const value = formatServingAmount(.01 / 28.35);
    expect(validateServing(value, 'oz', 100).error).toBe('Enter at least 0.01 ounces.');
    expect(Number(value)).toBe(.01 / 28.35);
  });
  test('small converted decimals never use scientific notation', () => {
    expect(formatServingAmount(1e-8)).toBe('0.00000001');
    expect(formatServingAmount(1e21)).toBe('1000000000000000000000');
  });
});


describe('display-only serving precision', () => {
  test.each([[1, '1'], [1.5, '1.5'], [1.23, '1.23'], [1.2300, '1.23'], [1.234567, '1.23'], [1.999, '2'], [0.0001, '0'], [-0.0001, '0'], [0.1 + 0.2, '0.3'], [100, '100']])('%s displays as %s', (amount, expected) => {
    const { formatServingAmountDisplay } = require('@/lib/food-validation');
    expect(formatServingAmountDisplay(amount)).toBe(expected);
  });
});


describe('stepServingAmount', () => {
  test('steps by 0.5 servings, 10 g or 0.5 oz', () => {
    expect(stepServingAmount('1', 'default', 1)).toBe('1.5');
    expect(stepServingAmount('100', 'grams', 1)).toBe('110');
    expect(stepServingAmount('100', 'grams', -1)).toBe('90');
    expect(stepServingAmount('3', 'oz', -1)).toBe('2.5');
  });
  test('off-grid values snap to the grid in both directions', () => {
    expect(stepServingAmount('2.25', 'default', 1)).toBe('2.5');
    expect(stepServingAmount('2.25', 'default', -1)).toBe('2');
    expect(stepServingAmount('105', 'grams', 1)).toBe('110');
    expect(stepServingAmount('105', 'grams', -1)).toBe('100');
  });
  test('never reaches 0 or below', () => {
    expect(stepServingAmount('0.5', 'default', -1)).toBeNull();
    expect(stepServingAmount('0.25', 'default', -1)).toBeNull();
    expect(stepServingAmount('10', 'grams', -1)).toBeNull();
  });
  test('empty or invalid input steps up from nothing and cannot step down', () => {
    expect(stepServingAmount('', 'default', 1)).toBe('0.5');
    expect(stepServingAmount('abc', 'grams', 1)).toBe('10');
    expect(stepServingAmount('', 'default', -1)).toBeNull();
    expect(stepServingAmount('1.2.3', 'oz', -1)).toBeNull();
  });
  test('comma decimals follow parseFoodDecimal and large values stay unrounded', () => {
    expect(stepServingAmount('1,5', 'default', 1)).toBe('2');
    expect(stepServingAmount('1000000', 'grams', 1)).toBe('1000010');
  });
});
