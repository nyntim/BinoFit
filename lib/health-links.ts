import type * as SQLite from 'expo-sqlite';
import { getDatabase } from '@/lib/database';
import type { HealthLinkRow } from '@/lib/health-sync';

export type HealthLink = HealthLinkRow & { updated_at: string };

function rowFromDb(r: HealthLink): HealthLinkRow {
  return {
    kind: r.kind,
    local_id: r.local_id,
    nutrient: r.nutrient as HealthLinkRow['nutrient'],
    origin: r.origin,
    hk_id: r.hk_id,
    hk_type: r.hk_type,
    content_hash: r.content_hash,
    sync_version: r.sync_version,
    pending_delete: r.pending_delete,
  };
}

export async function initHealthLinksSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS health_links (
      kind TEXT NOT NULL,
      local_id TEXT NOT NULL,
      nutrient TEXT NOT NULL DEFAULT '',
      origin TEXT NOT NULL,
      hk_id TEXT,
      hk_type TEXT,
      content_hash TEXT,
      sync_version INTEGER NOT NULL DEFAULT 0,
      pending_delete INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (kind, local_id, nutrient)
    );
  `);
}

export async function getAllHealthLinks(): Promise<HealthLinkRow[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<HealthLink>('SELECT * FROM health_links');
  return rows.map(rowFromDb);
}

export async function upsertHealthLink(
  link: HealthLinkRow & { updated_at?: string }
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO health_links (kind, local_id, nutrient, origin, hk_id, hk_type, content_hash, sync_version, pending_delete, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(kind, local_id, nutrient) DO UPDATE SET
       origin = excluded.origin,
       hk_id = excluded.hk_id,
       hk_type = excluded.hk_type,
       content_hash = excluded.content_hash,
       sync_version = excluded.sync_version,
       pending_delete = excluded.pending_delete,
       updated_at = excluded.updated_at`,
    [
      link.kind,
      link.local_id,
      link.nutrient ?? '',
      link.origin,
      link.hk_id,
      link.hk_type,
      link.content_hash,
      link.sync_version,
      link.pending_delete,
      link.updated_at ?? now,
    ]
  );
}

export async function deleteHealthLink(
  kind: HealthLinkRow['kind'],
  localId: string,
  nutrient = ''
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'DELETE FROM health_links WHERE kind = ? AND local_id = ? AND nutrient = ?',
    [kind, localId, nutrient]
  );
}

export async function markPendingDelete(
  kind: HealthLinkRow['kind'],
  localId: string
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE health_links SET pending_delete = 1, updated_at = ?
     WHERE kind = ? AND local_id = ? AND origin = 'out'`,
    [now, kind, localId]
  );
}

export async function removeInboundWeightLinksForDates(dates: string[]): Promise<void> {
  if (dates.length === 0) return;
  const db = await getDatabase();
  const placeholders = dates.map(() => '?').join(', ');
  await db.runAsync(
    `DELETE FROM health_links WHERE kind = 'weight' AND origin = 'in' AND local_id IN (
       SELECT id FROM weight_entries WHERE date IN (${placeholders})
     )`,
    dates
  );
}
