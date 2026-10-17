import {
  planWeightImport,
  planWeightExport,
  planNutritionExport,
  planWorkoutExport,
  linksAfterWeightExport,
  roundKg,
  localDateFromIso,
  nutritionNoonIso,
  nutritionSyncId,
  WORKOUT_ACTIVITY_TYPE,
  type HealthLinkRow,
  type WeightHealthRow,
} from '@/lib/health-sync';

const row = (over: Partial<WeightHealthRow> & Pick<WeightHealthRow, 'date' | 'id'>): WeightHealthRow => ({
  source: 'manual',
  weight_kg: 80,
  measured_at: `${over.date}T12:00:00.000Z`,
  updated_at: `${over.date}T12:00:00.000Z`,
  deleted_at: null,
  ...over,
});

describe('planWeightImport', () => {
  it('drops out-of-range, binofit, and outbound samples', () => {
    const actions = planWeightImport(
      [
        { id: 'a', weight_kg: 19.9, startDate: '2026-01-01T08:00:00.000Z' },
        { id: 'b', weight_kg: 400.1, startDate: '2026-01-01T08:00:00.000Z' },
        { id: 'c', weight_kg: 80, startDate: '2026-01-01T08:00:00.000Z', syncIdentifier: 'binofit:weight:x' },
        { id: 'd', weight_kg: 80, startDate: '2026-01-01T08:00:00.000Z' },
      ],
      [],
      new Set(['d'])
    );
    expect(actions).toHaveLength(0);
  });

  it('keeps the later sample per day and tie-breaks on id', () => {
    const actions = planWeightImport(
      [
        { id: 'a', weight_kg: 79, startDate: '2026-06-01T08:00:00.000Z' },
        { id: 'b', weight_kg: 80, startDate: '2026-06-01T09:00:00.000Z' },
        { id: 'c', weight_kg: 81, startDate: '2026-06-01T09:00:00.000Z' },
      ],
      [],
      new Set()
    );
    expect(actions).toEqual([
      expect.objectContaining({ type: 'insert', weight_kg: 81, hkSampleId: 'c' }),
    ]);
  });

  it('skips manual days and treats missing source as manual', () => {
    expect(
      planWeightImport(
        [{ id: 's', weight_kg: 90, startDate: '2026-06-01T10:00:00.000Z' }],
        [row({ id: 'm', date: '2026-06-01', source: 'manual' })],
        new Set()
      )
    ).toHaveLength(0);
    expect(
      planWeightImport(
        [{ id: 's', weight_kg: 90, startDate: '2026-06-01T10:00:00.000Z' }],
        [row({ id: 'm', date: '2026-06-01', source: null })],
        new Set()
      )
    ).toHaveLength(0);
  });

  it('updates healthkit rows when sample or rounded kg differs', () => {
    const live = row({
      id: 'h',
      date: '2026-06-01',
      source: 'healthkit',
      weight_kg: 80,
      hk_sample_id: 'old',
    });
    expect(
      planWeightImport(
        [{ id: 'old', weight_kg: 80.004, startDate: '2026-06-01T10:00:00.000Z' }],
        [live],
        new Set()
      )
    ).toHaveLength(0);
    expect(
      planWeightImport(
        [{ id: 'new', weight_kg: 80, startDate: '2026-06-01T10:00:00.000Z' }],
        [live],
        new Set()
      )
    ).toEqual([expect.objectContaining({ type: 'update', id: 'h', hkSampleId: 'new' })]);
  });

  it('respects tombstones and local calendar days', () => {
    expect(
      planWeightImport(
        [{ id: 's', weight_kg: 80, startDate: '2026-06-01T11:00:00.000Z' }],
        [row({ id: 't', date: '2026-06-01', deleted_at: '2026-06-01T12:00:00.000Z', updated_at: '2026-06-01T12:00:00.000Z' })],
        new Set()
      )
    ).toHaveLength(0);
    expect(
      planWeightImport(
        [{ id: 's', weight_kg: 80, startDate: '2026-06-01T13:00:00.000Z' }],
        [row({ id: 't', date: '2026-06-01', deleted_at: '2026-06-01T12:00:00.000Z', updated_at: '2026-06-01T12:00:00.000Z' })],
        new Set()
      )
    ).toHaveLength(1);
    const utcLate = '2026-06-02T06:00:00.000Z';
    expect(localDateFromIso(utcLate)).toBe(formatLocal(utcLate));
  });
});

function formatLocal(iso: string) {
  const { format } = require('date-fns');
  return format(new Date(iso), 'yyyy-MM-dd');
}

describe('planWeightExport', () => {
  const links: HealthLinkRow[] = [
    {
      kind: 'weight',
      local_id: 'in1',
      nutrient: '',
      origin: 'in',
      hk_id: 'hk-in',
      hk_type: 'BodyMass',
      content_hash: null,
      sync_version: 0,
      pending_delete: 0,
    },
    {
      kind: 'weight',
      local_id: 'out1',
      nutrient: '',
      origin: 'out',
      hk_id: 'hk-out',
      hk_type: 'BodyMass',
      content_hash: '80|t',
      sync_version: 2,
      pending_delete: 1,
    },
  ];

  it('omits healthkit rows and pending out-link deletes', () => {
    const actions = planWeightExport(
      [row({ id: 'hk', date: '2026-06-01', source: 'healthkit' })],
      links,
      new Set(['out1'])
    );
    expect(actions.filter((a) => a.type === 'save')).toHaveLength(0);
    expect(actions).toContainEqual({ type: 'delete', hk_id: 'hk-out', entryId: 'out1' });
    expect(actions.some((a) => a.type === 'delete' && (a as any).entryId === 'in1')).toBe(false);
  });

  it('skips unchanged hash and bumps version on change', () => {
    const measured = '2026-06-01T08:00:00.000Z';
    const stable: HealthLinkRow[] = [
      {
        kind: 'weight',
        local_id: 'e1',
        nutrient: '',
        origin: 'out',
        hk_id: 'u1',
        hk_type: 'BodyMass',
        content_hash: `${roundKg(80)}|${measured}`,
        sync_version: 1,
        pending_delete: 0,
      },
    ];
    expect(
      planWeightExport(
        [row({ id: 'e1', date: '2026-06-01', weight_kg: 80, measured_at: measured })],
        stable,
        new Set(['e1'])
      )
    ).toHaveLength(0);
    const changed = planWeightExport(
      [row({ id: 'e1', date: '2026-06-01', weight_kg: 81, measured_at: measured })],
      stable,
      new Set(['e1'])
    );
    expect(changed[0]).toMatchObject({ type: 'delete', hk_id: 'u1', entryId: 'e1' });
    expect(changed[1]).toMatchObject({ type: 'save', syncVersion: 2, unit: 'kg' });
  });
});

describe('planNutritionExport', () => {
  it('deletes zeros and writes four sync ids at local noon', () => {
    const links: HealthLinkRow[] = [
      {
        kind: 'nutrition',
        local_id: '2026-06-01',
        nutrient: 'energy',
        origin: 'out',
        hk_id: 'e1',
        hk_type: 'EnergyConsumed',
        content_hash: '1|0|0|0',
        sync_version: 1,
        pending_delete: 0,
      },
    ];
    const zero = planNutritionExport({ '2026-06-01': { calories: 0, protein: 0, carbs: 0, fat: 0 } }, links);
    expect(zero.some((a) => a.type === 'delete_all')).toBe(true);
    expect(zero.some((a) => a.type === 'save')).toBe(false);

    const save = planNutritionExport({ '2026-06-02': { calories: 2000, protein: 150, carbs: 200, fat: 65 } }, []);
    expect(save).toEqual([
      expect.objectContaining({
        type: 'save',
        sampleAt: nutritionNoonIso('2026-06-02'),
      }),
    ]);
    expect(nutritionSyncId('2026-06-02', 'energy')).toBe('binofit:nutrition:2026-06-02:energy');
  });
});

describe('planWorkoutExport', () => {
  it('skips invalid windows and tombstones delete', () => {
    expect(
      planWorkoutExport(
        [{ id: 'w1', started_at: null, ended_at: null, duration_seconds: null }],
        []
      )
    ).toHaveLength(0);
    expect(
      planWorkoutExport(
        [{ id: 'w2', started_at: '2026-06-01T10:00:00.000Z', ended_at: '2026-06-01T09:00:00.000Z', duration_seconds: null }],
        []
      )
    ).toHaveLength(0);
    const end = planWorkoutExport(
      [{ id: 'w3', started_at: '2026-06-01T10:00:00.000Z', ended_at: null, duration_seconds: 3600 }],
      []
    );
    expect(end[0]).toMatchObject({ type: 'save', activityType: WORKOUT_ACTIVITY_TYPE });

    const del = planWorkoutExport(
      [{ id: 'w4', started_at: '2026-06-01T10:00:00.000Z', ended_at: '2026-06-01T11:00:00.000Z', duration_seconds: null, deleted_at: '2026-06-02T00:00:00.000Z' }],
      [
        {
          kind: 'workout',
          local_id: 'w4',
          nutrient: '',
          origin: 'out',
          hk_id: 'wh',
          hk_type: 'Workout',
          content_hash: 'x',
          sync_version: 1,
          pending_delete: 0,
        },
      ]
    );
    expect(del).toContainEqual({ type: 'delete', hk_id: 'wh', workoutId: 'w4' });
  });
});

describe('idempotent weight export', () => {
  it('second plan emits no saves when links reflect the first pass', () => {
    const measured = '2026-06-01T08:00:00.000Z';
    const manual = [row({ id: 'e1', date: '2026-06-01', weight_kg: 80, measured_at: measured })];
    const first = planWeightExport(manual, [], new Set(['e1']));
    const links = linksAfterWeightExport([], first, new Map([['e1', { hk_id: 'uuid-1' }]]));
    const second = planWeightExport(manual, links, new Set(['e1']));
    expect(second.filter((a) => a.type === 'save')).toHaveLength(0);
  });
});
