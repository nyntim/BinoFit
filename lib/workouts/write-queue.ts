// Serial write queue: tasks run one at a time in the order they were enqueued, so a set added
// with a client id is always inserted before the edits that follow it.

export type WriteQueue = {
  /** Runs `task` after everything queued before it. Resolves when it finishes; never rejects. */
  enqueue: (task: () => Promise<unknown>) => Promise<void>;
  /** Resolves when every task queued so far has finished. */
  drain: () => Promise<void>;
  /** Number of tasks not finished yet. */
  pending: () => number;
};

/** A failing task is reported to `onError`; later tasks still run. */
export function createWriteQueue(onError: (error: unknown) => void): WriteQueue {
  let tail: Promise<void> = Promise.resolve();
  let count = 0;

  const enqueue = (task: () => Promise<unknown>): Promise<void> => {
    count += 1;
    const run = tail.then(async () => {
      try {
        await task();
      } catch (e) {
        try {
          onError(e);
        } catch {
          // An onError that throws must not stop the queue.
        }
      } finally {
        count -= 1;
      }
    });
    tail = run;
    return run;
  };

  return {
    enqueue,
    drain: () => tail,
    pending: () => count,
  };
}
