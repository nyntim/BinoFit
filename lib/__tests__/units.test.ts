import {
  displayToMetres,
  distanceUnitFor,
  formatDuration,
  formatPace,
  formatWeight,
  formatWeightWithUnit,
  kgToLb,
  lbToKg,
  metresToDisplay,
  pace,
  parseDecimal,
} from '@/lib/units';

describe('weight conversion', () => {
  it.each([135, 2.5, 0])('lb -> kg -> lb round trip does not drift for %s', (lb) => {
    expect(kgToLb(lbToKg(lb))).toBeCloseTo(lb, 10);
    expect(formatWeight(lbToKg(lb), 'lb')).toBe(String(lb));
  });

  it('converts a known value', () => {
    expect(lbToKg(135)).toBeCloseTo(61.235, 3);
    expect(kgToLb(100)).toBeCloseTo(220.462, 3);
  });

  it('formatWeight rounds to 2 decimals and trims zeros', () => {
    expect(formatWeight(72.5, 'kg')).toBe('72.5');
    expect(formatWeight(72, 'kg')).toBe('72');
    expect(formatWeight(72.456, 'kg')).toBe('72.46');
    expect(formatWeight(0, 'kg')).toBe('0');
  });

  it('formatWeightWithUnit appends the unit', () => {
    expect(formatWeightWithUnit(72.5, 'kg')).toBe('72.5 kg');
    expect(formatWeightWithUnit(lbToKg(135), 'lb')).toBe('135 lb');
  });
});

describe('distance', () => {
  it('distance unit follows the weight unit', () => {
    expect(distanceUnitFor('kg')).toBe('km');
    expect(distanceUnitFor('lb')).toBe('mi');
  });

  it('metres round trip through display units', () => {
    expect(metresToDisplay(5000, 'kg')).toBe(5);
    expect(metresToDisplay(1609.344, 'lb')).toBeCloseTo(1, 10);
    expect(displayToMetres(metresToDisplay(8047, 'lb'), 'lb')).toBeCloseTo(8047, 6);
  });
});

describe('parseDecimal', () => {
  it('accepts a comma decimal separator', () => {
    expect(parseDecimal('72,5')).toBe(72.5);
  });
  it('accepts dot decimals and integers', () => {
    expect(parseDecimal('72.5')).toBe(72.5);
    expect(parseDecimal(' 10 ')).toBe(10);
    expect(parseDecimal('0')).toBe(0);
  });
  it.each(['', '   ', '-1', 'abc', '1.2.3', '1,2,3', '--', '1e3'])('returns null for %p', (input) => {
    expect(parseDecimal(input)).toBeNull();
  });
});

describe('pace', () => {
  it('is null with zero distance or zero duration', () => {
    expect(pace(0, 600, 'kg')).toBeNull();
    expect(pace(1000, 0, 'kg')).toBeNull();
    expect(pace(-5, 600, 'kg')).toBeNull();
  });
  it('is seconds per km for kg', () => {
    expect(pace(5000, 1500, 'kg')).toBe(300);
  });
  it('is seconds per mile for lb', () => {
    expect(pace(1609.344, 480, 'lb')).toBeCloseTo(480, 6);
  });
  it('km and mi differ for the same run', () => {
    expect(pace(5000, 1500, 'lb')).toBeGreaterThan(pace(5000, 1500, 'kg') as number);
  });
});

describe('formatDuration', () => {
  it('formats under a minute', () => expect(formatDuration(59)).toBe('0:59'));
  it('formats an hour as h:mm:ss', () => expect(formatDuration(3600)).toBe('1:00:00'));
  it('formats zero', () => expect(formatDuration(0)).toBe('0:00'));
  it('pads and rounds', () => {
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(59.6)).toBe('1:00');
  });
  it('clamps negatives to zero', () => expect(formatDuration(-10)).toBe('0:00'));
});

describe('formatPace', () => {
  it('shows -- when there is no pace', () => expect(formatPace(null, 'kg')).toBe('--'));
  it('labels per km or per mi', () => {
    expect(formatPace(330, 'kg')).toBe('5:30 /km');
    expect(formatPace(330, 'lb')).toBe('5:30 /mi');
  });
});
