import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('capsule.db');

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('text','image','audio','file')),
      timestamp_created INTEGER NOT NULL,
      content TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      reviewed_flag INTEGER DEFAULT 0,
      archived_flag INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  return db;
}

export type ItemType = 'text' | 'image' | 'audio' | 'file';

export interface CapsuleItem {
  id: string;
  type: ItemType;
  timestamp_created: number;
  content: string;
  metadata_json: string;
  reviewed_flag: number;
  archived_flag: number;
}

export async function generateId(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function insertItem(
  type: ItemType,
  content: string,
  metadata: Record<string, unknown> = {},
): Promise<CapsuleItem> {
  const database = await getDatabase();
  const id = await generateId();
  const now = Date.now();
  const metaStr = JSON.stringify(metadata);

  await database.runAsync(
    'INSERT INTO items (id, type, timestamp_created, content, metadata_json) VALUES (?, ?, ?, ?, ?)',
    [id, type, now, content, metaStr]
  );

  return { id, type, timestamp_created: now, content, metadata_json: metaStr, reviewed_flag: 0, archived_flag: 0 };
}

export async function getUnreviewedItems(): Promise<CapsuleItem[]> {
  const database = await getDatabase();
  return await database.getAllAsync<CapsuleItem>(
    'SELECT * FROM items WHERE reviewed_flag = 0 AND archived_flag = 0 ORDER BY timestamp_created DESC'
  );
}

export async function getArchivedItems(): Promise<CapsuleItem[]> {
  const database = await getDatabase();
  return await database.getAllAsync<CapsuleItem>(
    'SELECT * FROM items WHERE archived_flag = 1 ORDER BY timestamp_created DESC'
  );
}

export async function markReviewed(ids: string[]): Promise<void> {
  const database = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  await database.runAsync(
    `UPDATE items SET reviewed_flag = 1 WHERE id IN (${placeholders})`,
    ids
  );
}

export async function archiveItem(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('UPDATE items SET archived_flag = 1, reviewed_flag = 1 WHERE id = ?', [id]);
}

export async function deleteItem(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM items WHERE id = ?', [id]);
}

export async function deleteItems(ids: string[]): Promise<void> {
  const database = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  await database.runAsync(`DELETE FROM items WHERE id IN (${placeholders})`, ids);
}

export async function getItemCount(): Promise<number> {
  const database = await getDatabase();
  const result = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM items');
  return result?.count ?? 0;
}

export async function getStorageStats(): Promise<{ text: number; image: number; audio: number; file: number; total: number }> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ type: string; cnt: number }>(
    'SELECT type, COUNT(*) as cnt FROM items GROUP BY type'
  );
  const stats = { text: 0, image: 0, audio: 0, file: 0, total: 0 };
  for (const row of rows) {
    if (row.type in stats) (stats as any)[row.type] = row.cnt;
    stats.total += row.cnt;
  }
  return stats;
}

// Settings helpers
export async function getSetting(key: string): Promise<string | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [key, value]
  );
}
