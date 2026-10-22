import type { DimensionValue } from 'react-native';

export const round1 = (v: number) => Math.round(v * 10) / 10;
export const formatNutrientValue = (value: number) => value.toLocaleString('en-US', { maximumSignificantDigits: 8 });
export const formatNum = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 });
export const percent = (fraction: number) => `${fraction * 100}%` as DimensionValue;
