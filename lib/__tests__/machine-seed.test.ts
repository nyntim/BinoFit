import { COMMON_MACHINE_BRANDS } from '@/lib/workouts/exercise-builder';
import {
  EQUIPMENT_OPTIONS,
  LOG_TYPE_OPTIONS,
  MUSCLE_GROUPS,
  MUSCLE_REGION,
  isRepLogType,
} from '@/lib/workouts/exercise-catalog';
import { ALL_SEED_EXERCISES } from '@/lib/workouts/exercise-seed';
import {
  BRAND_LINEUPS,
  MACHINE_SEED_EXERCISES,
  MACHINE_TEMPLATES,
  SEED_ALIASES,
  brandSlug,
} from '@/lib/workouts/machine-seed';

const machines = MACHINE_SEED_EXERCISES;
const DENYLIST = [
  'iso-lateral', 'insignia', 'signature series', 'selection', 'pure strength', 'skillrow', 'skillmill',
  'arc trainer', 'stairmaster', 'stepmill', 'gravitron', 'assault', 'echo bike', 'glute drive', 'spinning',
];

describe('machine seed dataset', () => {
  it('has 131 rows (within 110 to 150) with ids unique across all seeds', () => {
    expect(machines).toHaveLength(131);
    expect(machines.length).toBeGreaterThanOrEqual(110);
    expect(machines.length).toBeLessThanOrEqual(150);
    const ids = ALL_SEED_EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('brandSlug', () => {
    expect(brandSlug('Hammer Strength')).toBe('hammer-strength');
    expect(brandSlug('Gym80')).toBe('gym80');
  });

  it('ids are slugs starting with the brand slug', () => {
    for (const m of machines) {
      expect(m.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(m.id.startsWith(`${brandSlug(m.brand!)}-`)).toBe(true);
    }
  });

  it('names and brands are valid and name+brand is unique', () => {
    const seen = new Set<string>();
    for (const m of machines) {
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.name).toBe(m.name.trim());
      expect(COMMON_MACHINE_BRANDS).toContain(m.brand);
      const key = `${m.name}|${m.brand}`.toLowerCase();
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    for (const b of COMMON_MACHINE_BRANDS) expect(machines.some((m) => m.brand === b)).toBe(true);
  });

  it('uses valid enums, muscles and regions', () => {
    const logTypes = LOG_TYPE_OPTIONS.map((o) => o.id);
    for (const m of machines) {
      expect(logTypes).toContain(m.log_type);
      expect(EQUIPMENT_OPTIONS).toContain(m.equipment);
      expect(m.primary_muscles.length).toBeGreaterThan(0);
      for (const mu of [...m.primary_muscles, ...m.secondary_muscles]) expect(MUSCLE_GROUPS).toContain(mu);
      for (const mu of m.primary_muscles) expect(m.secondary_muscles).not.toContain(mu);
      expect(m.group).toBe(MUSCLE_REGION[m.primary_muscles[0]]);
      expect(m.group).not.toBeNull();
    }
  });

  it('applies the per side, load type and cardio rules', () => {
    for (const m of machines) {
      if (m.per_side === 1) expect(isRepLogType(m.log_type)).toBe(true);
      expect(m.load_type !== null).toBe(m.equipment === 'machine');
      if (m.equipment === 'cardio_machine') {
        expect(m.primary_muscles).toEqual(['cardio']);
        expect(m.secondary_muscles).toEqual([]);
        expect(m.default_rest_seconds).toBeNull();
        expect(['duration', 'distance_duration']).toContain(m.log_type);
      } else {
        expect(m.default_rest_seconds).toBeGreaterThan(0);
      }
      expect(m.met).toBeGreaterThan(0);
    }
  });

  it('aliases are clean and SEED_ALIASES covers exactly the machines', () => {
    for (const m of machines) {
      const aliases = SEED_ALIASES.get(m.id)!;
      expect(aliases).toBeDefined();
      expect(new Set(aliases).size).toBe(aliases.length);
      for (const a of aliases) {
        expect(a).toBe(a.trim().toLowerCase());
        expect(a.length).toBeGreaterThan(0);
        expect(a).not.toBe(m.name.toLowerCase());
      }
    }
    expect([...SEED_ALIASES.keys()].sort()).toEqual(machines.map((m) => m.id).sort());
  });

  it('uses every template at least once', () => {
    const used = new Set(Object.values(BRAND_LINEUPS).flat());
    for (const key of Object.keys(MACHINE_TEMPLATES)) expect(used.has(key as never)).toBe(true);
  });

  it('keeps names and aliases descriptive', () => {
    const brands = COMMON_MACHINE_BRANDS.map((b) => b.toLowerCase());
    for (const m of machines) {
      const texts = [m.name, ...SEED_ALIASES.get(m.id)!].map((x) => x.toLowerCase());
      for (const text of texts) {
        for (const b of brands) expect(text).not.toContain(b);
        for (const d of DENYLIST) expect(text).not.toContain(d);
      }
    }
  });
});
