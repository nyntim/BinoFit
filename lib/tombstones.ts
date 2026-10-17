import { getDatabase } from '@/lib/database';

/** Tables that carry deleted_at / synced_at and may be passed to the helpers below. */
const TOMBSTONE_TABLES = ['food_logs'] as const;
export type TombstoneTable = (typeof TOMBSTONE_TABLES)[number];

function assertTable(table: string): asserts table is TombstoneTable {
  if (!(TOMBSTONE_TABLES as readonly string[]).includes(table)) {
    throw new Error(`Not a tombstone table: ${table}`);
  }
}

/**
 * `UPDATE <table> SET deleted_at = ?, updated_at = ?, synced_at = NULL`. Append a WHERE clause;
 * bind `now` twice, then the WHERE params. Callers should add `deleted_at IS NULL`.
 */
export function tombstoneSql(table: string): string {
  assertTable(table);
  return `UPDATE ${table} SET deleted_at = ?, updated_at = ?, synced_at = NULL`;
}

/**
 * Marks rows synced only if they are unchanged since the push (same updated_at), so an edit made
 * while the push was in flight stays unsynced.
 */
export async function markRowsSynced(
  table: string,
  rows: { id: string; updated_at: string }[]
): Promise<void> {
  assertTable(table);
  if (rows.length === 0) return;
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const r of rows) {
      await txn.runAsync(`UPDATE ${table} SET synced_at = ? WHERE id = ? AND updated_at = ?`, [
        now,
        r.id,
        r.updated_at,
      ]);
    }
  });
}

/** Removes tombstones that have been pushed. */
export async function purgeSyncedTombstones(table: string): Promise<void> {
  assertTable(table);
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM ${table} WHERE deleted_at IS NOT NULL AND synced_at IS NOT NULL`);
}

export type RemoteApplyDecision = 'skip' | 'upsert' | 'delete';

function isNewer(remote: string | null | undefined, local: string | null | undefined): boolean {
  const r = remote ? Date.parse(remote) : NaN;
  const l = local ? Date.parse(local) : NaN;
  if (!Number.isFinite(l)) return true;
  return Number.isFinite(r) && r > l;
}

/**
 * What to do with a remote row given the local copy (null when absent).
 * A newer remote tombstone deletes the local row; a tombstone with no local row is skipped;
 * otherwise last write wins on updated_at and ties keep local.
 */
export function decideRemoteApply(
  remote: { updated_at: string | null; deleted_at?: string | null },
  local: { updated_at: string } | null
): RemoteApplyDecision {
  const isTombstone = remote.deleted_at != null;
  if (!local) return isTombstone ? 'skip' : 'upsert';
  if (!isNewer(remote.updated_at, local.updated_at)) return 'skip';
  return isTombstone ? 'delete' : 'upsert';
}
