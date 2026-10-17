import Database from 'better-sqlite3';

/**
 * better-sqlite3 errors come from another realm, so `instanceof Error` fails under Jest. expo-sqlite
 * throws plain Errors; rethrow the same way so code that checks `e instanceof Error` behaves.
 */
function realmSafe<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error(String((e as { message?: string } | null)?.message ?? e));
  }
}

/** Minimal expo-sqlite async API backed by an in-memory better-sqlite3 db. */
export function createMemoryDb() {
  const db = new Database(':memory:');
  const transaction = async (task: (txn: any) => Promise<void>) => {
    db.exec('BEGIN');
    try {
      await task(self);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
  const self: any = {
    raw: db,
    execAsync: async (sql: string) => {
      realmSafe(() => db.exec(sql));
    },
    runAsync: async (sql: string, params: any[] = []) => {
      realmSafe(() => db.prepare(sql).run(...params));
    },
    getAllAsync: async (sql: string, params: any[] = []) => realmSafe(() => db.prepare(sql).all(...params)),
    withTransactionAsync: transaction,
    withExclusiveTransactionAsync: transaction,
    getFirstAsync: async (sql: string, params: any[] = []) =>
      realmSafe(() => db.prepare(sql).get(...params)) ?? null,
  };
  return self;
}
