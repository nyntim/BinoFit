import Database from 'better-sqlite3';

/** Minimal expo-sqlite async API backed by an in-memory better-sqlite3 db. */
export function createMemoryDb() {
  const db = new Database(':memory:');
  return {
    raw: db,
    execAsync: async (sql: string) => {
      db.exec(sql);
    },
    runAsync: async (sql: string, params: any[] = []) => {
      db.prepare(sql).run(...params);
    },
    getAllAsync: async (sql: string, params: any[] = []) => db.prepare(sql).all(...params),
    getFirstAsync: async (sql: string, params: any[] = []) =>
      db.prepare(sql).get(...params) ?? null,
  };
}
