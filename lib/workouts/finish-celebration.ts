// One-shot, in-memory flag that a workout was just finished from the live session, so the
// finished-workout screen shows its celebration banner once. Never persisted: opening a workout
// from history, the Training tab or the day view never celebrates.
const justFinished = new Set<string>();

/** Marks the workout as just finished (called by the live session after Finish). */
export function markJustFinished(id: string): void {
  justFinished.add(id);
}

/** True while the workout is marked; does not clear the mark. */
export function wasJustFinished(id: string): boolean {
  return justFinished.has(id);
}

/** Clears the mark (called when the finished-workout screen is left). */
export function clearJustFinished(id: string): void {
  justFinished.delete(id);
}
