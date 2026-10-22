import * as Crypto from 'expo-crypto';
import type { WaterLog } from '@/lib/types';
import { getDatabase } from '@/lib/database-connection';

export async function addWaterLog(
  entry: Omit<WaterLog, 'id' | 'created_at'>
): Promise<WaterLog> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const id = Crypto.randomUUID();
  await db.runAsync(
    `INSERT INTO water_logs (id, date, amount, drink_name, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, entry.date, entry.amount, entry.drink_name, now]
  );
  return { ...entry, id, created_at: now };
}

export async function getWaterLogsByDate(date: string): Promise<WaterLog[]> {
  const db = await getDatabase();
  return db.getAllAsync<WaterLog>(
    'SELECT * FROM water_logs WHERE date = ? ORDER BY created_at',
    [date]
  );
}

export async function deleteWaterLog(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM water_logs WHERE id = ?', [id]);
}

