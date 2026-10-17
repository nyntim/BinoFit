import { commitPendingEdits, registerPendingEdit } from '@/lib/workouts/pending-edits';

describe('pending edits', () => {
  it('commits every registered field, skips unregistered ones, survives a throw', () => {
    const a = jest.fn(() => {
      throw new Error('x');
    });
    const b = jest.fn();
    const c = jest.fn();
    const ua = registerPendingEdit(a);
    const ub = registerPendingEdit(b);
    const uc = registerPendingEdit(c);
    uc();
    commitPendingEdits();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(c).not.toHaveBeenCalled();
    ua();
    ub();
  });
});

import { setupDetailLine } from '@/lib/workouts/format';

describe('setupDetailLine', () => {
  it('joins notes and loading with the unit', () => {
    expect(setupDetailLine({ setup_notes: 'Seat 4, back pad 2', load_type: 'plate', base_weight_kg: 20 }, 'kg')).toBe(
      'Seat 4, back pad 2 · Plate-loaded, 20 kg sled'
    );
    expect(setupDetailLine({ setup_notes: null, load_type: 'plate', base_weight_kg: 20 }, 'lb')).toBe('Plate-loaded, 44.09 lb sled');
    expect(setupDetailLine({ setup_notes: null, load_type: null, base_weight_kg: null }, 'kg')).toBeNull();
  });
});
