// While the account changes (sign-in merge, sign-out wipe) sync must not start a pass: it
// would write rows under the user id that is about to be replaced.
let depth = 0;

export function isAuthTransitioning(): boolean {
  return depth > 0;
}

/** Suspends new sync passes. Returns a release function; calling it more than once is harmless. */
export function beginAuthTransition(): () => void {
  depth++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    depth--;
  };
}

/** Test helper. */
export function resetAuthTransition(): void {
  depth = 0;
}
