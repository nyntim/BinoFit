import { openMealEditAfterReload } from '@/lib/meal-settings-entry';

const snapshot = { defs: [{ id: 'fresh' }], names: [{ id: 'name' }] };

test('starts meal edit from the completed fresh reload, not a prior snapshot', async () => {
  let resolve!: (value: typeof snapshot) => void;
  const reload = jest.fn(() => new Promise<typeof snapshot>((r) => { resolve = r; }));
  const start = jest.fn();
  const pending = openMealEditAfterReload(reload as never, () => false, start);
  expect(start).not.toHaveBeenCalled();
  resolve(snapshot);
  await pending;
  expect(start).toHaveBeenCalledWith(snapshot);
  expect(reload).toHaveBeenCalledTimes(1);
});

test('does not replace a meal draft already open before or during reload', async () => {
  const start = jest.fn();
  const reload = jest.fn(async () => snapshot);
  await openMealEditAfterReload(reload as never, () => true, start);
  expect(reload).not.toHaveBeenCalled();

  let editing = false;
  let resolve!: (value: typeof snapshot) => void;
  const deferredReload = jest.fn(() => new Promise<typeof snapshot>((r) => { resolve = r; }));
  const pending = openMealEditAfterReload(deferredReload as never, () => editing, start);
  expect(deferredReload).toHaveBeenCalledTimes(1);
  editing = true;
  resolve(snapshot);
  await pending;
  expect(start).not.toHaveBeenCalled();
});
