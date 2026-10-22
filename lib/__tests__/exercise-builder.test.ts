import {
  applyEquipment,
  applyLogType,
  applySuggestion,
  brandChips,
  builderSteps,
  COMMON_MACHINE_BRANDS,
  draftSummary,
  draftToExerciseInput,
  emptyDraft,
  exerciseToDraft,
  firstInvalidStep,
  isStepValid,
  nameSuggestions,
  primaryLabel,
  reviewRows,
  setDraftName,
  toggleMuscle,
  type BuilderDraft,
} from '@/lib/workouts/exercise-builder';
import { lbToKg } from '@/lib/units';
import type { Exercise } from '@/lib/types';

const valid = (over: Partial<BuilderDraft> = {}): BuilderDraft => ({
  ...emptyDraft('Chest press'),
  equipment: 'barbell',
  primary: ['chest'],
  ...over,
});

describe('builderSteps', () => {
  it('machine has 8 steps including brand and loading', () => {
    expect(builderSteps(valid({ equipment: 'machine' }))).toEqual([
      'equipment', 'brand', 'loading', 'name', 'muscles', 'logtype', 'notes', 'review',
    ]);
  });
  it('cable has 7 steps (brand, no loading)', () => {
    const s = builderSteps(valid({ equipment: 'cable' }));
    expect(s).toHaveLength(7);
    expect(s).toContain('brand');
    expect(s).not.toContain('loading');
  });
  it('cardio machine has a brand step', () => {
    expect(builderSteps(valid({ equipment: 'cardio_machine' }))).toContain('brand');
  });
  it('barbell has 6 steps', () => {
    expect(builderSteps(valid({ equipment: 'barbell' }))).toHaveLength(6);
  });
});

describe('step validity', () => {
  it('name must be non-blank after trimming', () => {
    expect(isStepValid(valid({ name: '   ' }), 'name')).toBe(false);
    expect(isStepValid(valid({ name: ' x ' }), 'name')).toBe(true);
  });
  it('a primary muscle is required', () => {
    expect(isStepValid(valid({ primary: [] }), 'muscles')).toBe(false);
    expect(isStepValid(valid(), 'muscles')).toBe(true);
  });
  it('equipment is required', () => {
    expect(isStepValid(emptyDraft('x'), 'equipment')).toBe(false);
  });
  it('a bad plate sled weight blocks the loading step', () => {
    const d = valid({ equipment: 'machine', loadType: 'plate', sled: 'abc' });
    expect(isStepValid(d, 'loading')).toBe(false);
    expect(firstInvalidStep(d)).toBe('loading');
    expect(isStepValid({ ...d, sled: '' }, 'loading')).toBe(true);
  });
  it('review is valid only when every step is', () => {
    expect(isStepValid(valid(), 'review')).toBe(true);
    expect(isStepValid(valid({ name: '' }), 'review')).toBe(false);
  });
});

describe('primaryLabel', () => {
  it('is Skip for an empty optional brand or notes, otherwise Next', () => {
    expect(primaryLabel(valid({ equipment: 'cable' }), 'brand')).toBe('Skip');
    expect(primaryLabel(valid({ equipment: 'cable', brand: 'Life Fitness' }), 'brand')).toBe('Next');
    expect(primaryLabel(valid(), 'notes')).toBe('Skip');
    expect(primaryLabel(valid({ notes: 'Seat 4' }), 'notes')).toBe('Next');
    expect(primaryLabel(valid(), 'name')).toBe('Next');
  });
  it('is Save on review', () => {
    expect(primaryLabel(valid(), 'review')).toBe('Save exercise');
    expect(primaryLabel(valid(), 'review', true)).toBe('Save changes');
  });
});

describe('applyEquipment', () => {
  it('sets the default log type per equipment', () => {
    expect(applyEquipment(emptyDraft(), 'cardio_machine').logType).toBe('distance_duration');
    expect(applyEquipment(emptyDraft(), 'bodyweight').logType).toBe('bodyweight_reps');
    expect(applyEquipment(applyEquipment(emptyDraft(), 'bodyweight'), 'barbell').logType).toBe('weight_reps');
    expect(applyEquipment(applyEquipment(emptyDraft(), 'cardio_machine'), 'dumbbell').logType).toBe('weight_reps');
  });
  it('keeps a deliberate log type such as duration or assisted', () => {
    expect(applyEquipment(applyLogType(emptyDraft(), 'assisted'), 'machine').logType).toBe('assisted');
  });
  it('clears the brand when the equipment has no brand step', () => {
    const d = applyEquipment({ ...emptyDraft(), brand: 'Hammer' }, 'barbell');
    expect(d.brand).toBe('');
    expect(applyEquipment({ ...emptyDraft(), brand: 'Hammer' }, 'machine').brand).toBe('Hammer');
  });
  it('drops per side when the new default log type is not rep based', () => {
    const d = applyEquipment({ ...emptyDraft(), perSide: true }, 'cardio_machine');
    expect(d.perSide).toBe(false);
  });
});

describe('toggleMuscle', () => {
  it('adds and removes within one list', () => {
    let d = toggleMuscle(emptyDraft(), 'primary', 'chest');
    expect(d.primary).toEqual(['chest']);
    d = toggleMuscle(d, 'primary', 'chest');
    expect(d.primary).toEqual([]);
  });
  it('moves a muscle between primary and secondary, never both', () => {
    let d = toggleMuscle(emptyDraft(), 'primary', 'chest');
    d = toggleMuscle(d, 'secondary', 'chest');
    expect(d.primary).toEqual([]);
    expect(d.secondary).toEqual(['chest']);
    d = toggleMuscle(d, 'primary', 'chest');
    expect(d.secondary).toEqual([]);
    expect(d.primary).toEqual(['chest']);
  });
});

describe('name suggestions', () => {
  const seeds = [
    { name: 'Barbell bench press', primary_muscles: ['chest'], secondary_muscles: ['triceps'], log_type: 'weight_reps' },
    { name: 'Dumbbell bench press', primary_muscles: ['chest'], secondary_muscles: [], log_type: 'weight_reps' },
    { name: 'Push-up', primary_muscles: ['chest'], secondary_muscles: [], log_type: 'bodyweight_reps' },
    { name: 'Leg press', primary_muscles: ['quads'], secondary_muscles: [], log_type: 'weight_reps' },
    { name: 'Chest fly press', primary_muscles: ['chest'], secondary_muscles: [], log_type: 'weight_reps' },
  ] as any[];

  it('returns nothing for names without a 3+ letter word', () => {
    expect(nameSuggestions('', seeds)).toEqual([]);
    expect(nameSuggestions('ab', seeds)).toEqual([]);
  });
  it('ranks by matched tokens then seed order and caps at 3', () => {
    const out = nameSuggestions('bench press', seeds).map((s) => s.name);
    expect(out).toEqual(['Barbell bench press', 'Dumbbell bench press', 'Leg press']);
  });
  it('never suggests an exact name match', () => {
    expect(nameSuggestions('Leg Press', seeds).map((s) => s.name)).not.toContain('Leg press');
  });
  it('picking a suggestion copies muscles and log type; editing the name clears copiedFrom', () => {
    let d = applySuggestion(emptyDraft('push'), seeds[2]);
    expect(d.primary).toEqual(['chest']);
    expect(d.logType).toBe('bodyweight_reps');
    expect(d.copiedFrom).toBe('Push-up');
    d = setDraftName(d, 'Push-ups');
    expect(d.copiedFrom).toBe('');
    expect(d.primary).toEqual(['chest']);
  });
  it('picking a suggestion sets the name and still drops per side for non-rep log types', () => {
    const d = applySuggestion({ ...emptyDraft('push'), perSide: true }, seeds[2]);
    expect(d.name).toBe('Push-up');
    expect(d.perSide).toBe(true);
    const timed = applySuggestion({ ...emptyDraft('plank'), perSide: true }, {
      name: 'Plank', primary_muscles: ['abs'], secondary_muscles: [], log_type: 'duration',
    } as any);
    expect(timed.name).toBe('Plank');
    expect(timed.perSide).toBe(false);
  });
});

describe('per side on the name step', () => {
  it('review has a Per side / unilateral row for rep log types only, jumping to the name step', () => {
    const rep = reviewRows(valid({ perSide: true }), 'kg');
    expect(rep.find((r) => r.label === 'Per side / unilateral')).toEqual({ step: 'name', label: 'Per side / unilateral', value: 'Yes' });
    expect(reviewRows(valid(), 'kg').find((r) => r.label === 'Per side / unilateral')?.value).toBe('No');
    expect(reviewRows(valid({ logType: 'duration' }), 'kg').some((r) => r.label === 'Per side / unilateral')).toBe(false);
  });
  it('Logged as omits per side in review but the saved summary keeps it', () => {
    const d = valid({ perSide: true });
    expect(reviewRows(d, 'kg').find((r) => r.label === 'Logged as')?.value).toBe('Weight × reps');
    expect(draftSummary(d)).toContain(', per side');
  });
  it('choosing a time log type after setting per side stores per_side 0', () => {
    const d = applyLogType(valid({ perSide: true }), 'duration');
    expect(draftToExerciseInput(d, 'kg').per_side).toBe(0);
  });
});

describe('brandChips', () => {
  it('offers the full common list when no brands were used', () => {
    expect(brandChips([])).toEqual({ used: [], common: [...COMMON_MACHINE_BRANDS] });
  });
  it('removes used brands from common case-insensitively and keeps list order', () => {
    const out = brandChips(['hammer strength']);
    expect(out.used).toEqual(['hammer strength']);
    expect(out.common).not.toContain('Hammer Strength');
    expect(out.common).toEqual(COMMON_MACHINE_BRANDS.filter((b) => b !== 'Hammer Strength'));
  });
  it('collapses duplicate used brands and trims whitespace', () => {
    expect(brandChips(['  Cybex ', 'cybex', '', 'Home gym']).used).toEqual(['Cybex', 'Home gym']);
  });
});

describe('draftToExerciseInput', () => {
  it('throws on an invalid draft', () => {
    expect(() => draftToExerciseInput(valid({ name: '' }), 'kg')).toThrow();
    expect(() => draftToExerciseInput(emptyDraft('x'), 'kg')).toThrow();
  });
  it('nulls brand, load type and sled when not applicable', () => {
    const out = draftToExerciseInput(
      valid({ equipment: 'barbell', brand: 'Rogue', loadType: 'plate', sled: '20', notes: '  ' }),
      'kg'
    );
    expect(out).toMatchObject({ brand: null, load_type: null, base_weight_kg: null, setup_notes: null });
  });
  it('keeps trimmed brand and stack load type for a machine', () => {
    const out = draftToExerciseInput(valid({ equipment: 'machine', brand: ' Hammer ', notes: ' Seat 4 ' }), 'kg');
    expect(out).toMatchObject({ brand: 'Hammer', load_type: 'stack', base_weight_kg: null, setup_notes: 'Seat 4' });
  });
  it('stores a kg sled weight as typed', () => {
    const out = draftToExerciseInput(valid({ equipment: 'machine', loadType: 'plate', sled: '20' }), 'kg');
    expect(out.base_weight_kg).toBe(20);
  });
  it('converts a lb sled weight to kg', () => {
    const out = draftToExerciseInput(valid({ equipment: 'machine', loadType: 'plate', sled: '45' }), 'lb');
    expect(out.base_weight_kg).toBeCloseTo(lbToKg(45), 6);
  });
  it('a zero or empty sled weight is null', () => {
    expect(draftToExerciseInput(valid({ equipment: 'machine', loadType: 'plate', sled: '0' }), 'kg').base_weight_kg).toBeNull();
    expect(draftToExerciseInput(valid({ equipment: 'machine', loadType: 'plate', sled: '' }), 'kg').base_weight_kg).toBeNull();
  });
  it('forces per side off for non-rep log types and keeps it for rep types', () => {
    expect(draftToExerciseInput(valid({ logType: 'duration', perSide: true }), 'kg').per_side).toBe(0);
    expect(draftToExerciseInput(valid({ logType: 'weight_reps', perSide: true }), 'kg').per_side).toBe(1);
  });
});

describe('exerciseToDraft', () => {
  it('round-trips a plate-loaded machine in lb', () => {
    const e = {
      name: 'Chest press', brand: 'Hammer', equipment: 'machine', load_type: 'plate', base_weight_kg: lbToKg(45),
      primary_muscles: ['chest'], secondary_muscles: ['triceps'], log_type: 'weight_reps', per_side: 1, setup_notes: 'Seat 4',
    } as unknown as Exercise;
    const d = exerciseToDraft(e, 'lb');
    expect(d.sled).toBe('45');
    expect(draftToExerciseInput(d, 'lb')).toMatchObject({ name: 'Chest press', per_side: 1, brand: 'Hammer' });
  });
});
