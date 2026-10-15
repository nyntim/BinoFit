import { act, renderHook } from '@testing-library/react-native';
import { useMealDraft } from '@/hooks/useMealDraft';
import { MEAL_LIMITS } from '@/lib/meals';
import { saveMealDraft } from '@/lib/database';
import type { MealDefinition, MealNameEntry } from '@/lib/types';

jest.mock('@/lib/database', () => ({ saveMealDraft: jest.fn(async () => {}) }));

const def = (id: string, position: number): MealDefinition => ({
  id,
  position,
  calorie_target: null,
  protein_target: null,
  carb_target: null,
  fat_target: null,
  created_at: '',
  updated_at: '',
});
const nm = (meal_id: string, name: string): MealNameEntry => ({
  meal_id,
  name,
  effective_from: '0000-01-01',
  updated_at: '',
});

const DEFS = [def('a', 0), def('b', 1), def('c', 2)];
const NAMES = [nm('a', 'A'), nm('b', 'B'), nm('c', 'C')];

async function setup(defs = DEFS, names = NAMES) {
  const r = await renderHook(() => useMealDraft());
  await act(async () => r.result.current.start(defs, names, '2026-06-01'));
  return r;
}

beforeEach(() => jest.clearAllMocks());

describe('useMealDraft', () => {
  it('is null and not dirty until started', async () => {
    const { result } = await renderHook(() => useMealDraft());
    expect(result.current.draft).toBeNull();
    expect(result.current.dirty).toBe(false);
  });

  it('starts clean from definitions and names', async () => {
    const { result } = await setup();
    expect(result.current.draft?.meals.map((m) => m.name)).toEqual(['A', 'B', 'C']);
    expect(result.current.dirty).toBe(false);
  });

  it('add generates unique default names and marks the draft dirty', async () => {
    const { result } = await setup();
    await act(async () => result.current.add());
    await act(async () => result.current.add());
    const added = result.current.draft!.meals.slice(3);
    expect(added.map((m) => m.name)).toEqual(['New meal', 'New meal 2']);
    expect(added.every((m) => m.isNew)).toBe(true);
    expect(new Set(added.map((m) => m.id)).size).toBe(2);
    expect(result.current.dirty).toBe(true);
    expect(result.current.hasErrors).toBe(false);
  });

  it('add stops at the maximum number of meals', async () => {
    const { result } = await setup();
    for (let i = 0; i < 20; i++) await act(async () => result.current.add());
    expect(result.current.draft!.meals).toHaveLength(MEAL_LIMITS.max);
  });

  it('remove records deleted ids for existing meals and marks dirty', async () => {
    const { result } = await setup();
    await act(async () => result.current.remove('b'));
    expect(result.current.draft!.meals.map((m) => m.id)).toEqual(['a', 'c']);
    expect(result.current.draft!.deletedIds).toEqual(['b']);
    expect(result.current.dirty).toBe(true);
  });

  it('removing a meal added in this draft does not record a deletion', async () => {
    const { result } = await setup();
    await act(async () => result.current.add());
    const id = result.current.draft!.meals[3].id;
    await act(async () => result.current.remove(id));
    expect(result.current.draft!.deletedIds).toEqual([]);
    expect(result.current.dirty).toBe(false);
  });

  it('cannot remove the last remaining meal', async () => {
    const { result } = await setup([def('a', 0)], [nm('a', 'A')]);
    await act(async () => result.current.remove('a'));
    expect(result.current.draft!.meals).toHaveLength(1);
    expect(result.current.draft!.deletedIds).toEqual([]);
  });

  it('reorder and moveBy mark dirty', async () => {
    const { result } = await setup();
    await act(async () => result.current.reorder(['c', 'a', 'b']));
    expect(result.current.draft!.meals.map((m) => m.id)).toEqual(['c', 'a', 'b']);
    expect(result.current.dirty).toBe(true);
    await act(async () => result.current.moveBy('c', 2));
    expect(result.current.draft!.meals.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(result.current.dirty).toBe(false);
  });

  it('reorder ignores an incomplete id list', async () => {
    const { result } = await setup();
    await act(async () => result.current.reorder(['c', 'a']));
    expect(result.current.draft!.meals.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('setTargets marks dirty', async () => {
    const { result } = await setup();
    await act(async () =>
      result.current.setTargets('a', {
        calorie_target: 500,
        protein_target: null,
        carb_target: null,
        fat_target: null,
      })
    );
    expect(result.current.draft!.meals[0].calorie_target).toBe(500);
    expect(result.current.dirty).toBe(true);
  });

  it('cancel discards the draft', async () => {
    const { result } = await setup();
    await act(async () => result.current.rename('a', 'Zed'));
    await act(async () => result.current.cancel());
    expect(result.current.draft).toBeNull();
    expect(result.current.dirty).toBe(false);
  });

  it('errors block save', async () => {
    const { result } = await setup();
    await act(async () => result.current.rename('a', 'b'));
    expect(result.current.hasErrors).toBe(true);
    let ok = true;
    await act(async () => {
      ok = await result.current.save('2026-06-01');
    });
    expect(ok).toBe(false);
    expect(saveMealDraft).not.toHaveBeenCalled();
    expect(result.current.draft).not.toBeNull();
  });

  it('empty names produce errors', async () => {
    const { result } = await setup();
    await act(async () => result.current.rename('a', '   '));
    expect(result.current.errors.a).not.toBeNull();
  });

  it('save writes the draft once and closes edit mode', async () => {
    const { result } = await setup();
    await act(async () => result.current.rename('a', 'Morning'));
    let ok = false;
    await act(async () => {
      ok = await result.current.save('2026-06-01');
    });
    expect(ok).toBe(true);
    expect(saveMealDraft).toHaveBeenCalledTimes(1);
    expect((saveMealDraft as jest.Mock).mock.calls[0][1]).toBe('2026-06-01');
    expect((saveMealDraft as jest.Mock).mock.calls[0][0].meals[0].name).toBe('Morning');
    expect(result.current.draft).toBeNull();
  });

  it('ignores a second save while one is in flight', async () => {
    let release: () => void = () => {};
    (saveMealDraft as jest.Mock).mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
    const { result } = await setup();
    await act(async () => result.current.rename('a', 'Morning'));
    let second = true;
    await act(async () => {
      const first = result.current.save('2026-06-01');
      second = await result.current.save('2026-06-01');
      release();
      await first;
    });
    expect(second).toBe(false);
    expect(saveMealDraft).toHaveBeenCalledTimes(1);
  });

  it('keeps the draft and resets saving when save fails', async () => {
    (saveMealDraft as jest.Mock).mockRejectedValueOnce(new Error('db'));
    const { result } = await setup();
    await act(async () => result.current.rename('a', 'Morning'));
    await act(async () => {
      await expect(result.current.save('2026-06-01')).rejects.toThrow('db');
    });
    expect(result.current.saving).toBe(false);
    expect(result.current.draft).not.toBeNull();
  });
});
