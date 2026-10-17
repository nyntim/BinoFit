// Registry of text fields that hold typed-but-uncommitted values (debounced cells, meta fields).
// The editor calls commitPendingEdits() before it flushes, so tapping Save, Back or "Add
// exercises" while a field is still focused never loses what was typed.

type Commit = () => void;
const commits = new Set<Commit>();

/** Registers a field's commit function. Returns the unregister function. */
export function registerPendingEdit(commit: Commit): () => void {
  commits.add(commit);
  return () => {
    commits.delete(commit);
  };
}

/** Asks every registered field to commit its pending text now. A throwing commit does not stop the others. */
export function commitPendingEdits(): void {
  for (const c of Array.from(commits)) {
    try {
      c();
    } catch {
      // Keep committing the rest.
    }
  }
}
