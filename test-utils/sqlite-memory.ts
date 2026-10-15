import Database from 'better-sqlite3';

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
      db.exec(sql);
    },
    runAsync: async (sql: string, params: any[] = []) => {
      db.prepare(sql).run(...params);
    },
    getAllAsync: async (sql: string, params: any[] = []) => db.prepare(sql).all(...params),
    withTransactionAsync: transaction,
    withExclusiveTransactionAsync: transaction,
    getFirstAsync: async (sql: string, params: any[] = []) =>
      db.prepare(sql).get(...params) ?? null,
  };
  return self;
}
