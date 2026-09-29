import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { encryptString, decryptString } from '../lib/crypto';
import { pickParent, buildGroupedChildren, addNoteToTree, type GroupMode } from '../lib/bundleTree';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('capsule.db');

  await db.execAsync(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('text','image','audio','file','bundle')),
      timestamp_created INTEGER NOT NULL,
      content TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      note TEXT,
      reviewed_flag INTEGER DEFAULT 0,
      archived_flag INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    -- Notes as a timestamped history (append-only) so the detail view can show a
    -- timeline. content is encrypted at rest.
    CREATE TABLE IF NOT EXISTS item_notes (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created INTEGER NOT NULL,
      FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE
    );
    -- Paid-tier foundation (AI discussion). Storage only; no AI is wired yet.
    -- content/outcome are encrypted at rest via the same crypto as items.
    CREATE TABLE IF NOT EXISTS discussions (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      created INTEGER NOT NULL,
      updated INTEGER NOT NULL,
      outcome TEXT,
      FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS discussion_messages (
      id TEXT PRIMARY KEY,
      discussion_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
      content TEXT NOT NULL,
      created INTEGER NOT NULL,
      FOREIGN KEY(discussion_id) REFERENCES discussions(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS context_files (
      id TEXT PRIMARY KEY,
      discussion_id TEXT NOT NULL,
      path TEXT NOT NULL,
      filename TEXT,
      mime TEXT,
      created INTEGER NOT NULL,
      FOREIGN KEY(discussion_id) REFERENCES discussions(id) ON DELETE CASCADE
    );
    -- One discussion per item — lets ensureDiscussion() be race-safe via INSERT OR IGNORE.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_discussions_item ON discussions(item_id);
  `);

  // Migration: a build predating the 'bundle' type created `items` with a CHECK that
  // rejects type='bundle'. CREATE TABLE IF NOT EXISTS won't alter an existing table, so
  // grouping's UPDATE ... type='bundle' would fail. Rebuild the table if needed. (Rows
  // are copied by identical id, so FKs from item_notes/discussions stay valid; FK
  // enforcement is toggled off around the rebuild, which must be outside a transaction.)
  const itemsMeta = await db.getFirstAsync<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='items'"
  );
  if (itemsMeta && !itemsMeta.sql.includes("'bundle'")) {
    // Follow SQLite's recommended table-rebuild: create the NEW table under a temp name,
    // copy, DROP the old, then RENAME the new INTO place. We must NOT rename the *old*
    // (referenced) table out of the way — modern SQLite rewrites child FK references on
    // such a rename, which would leave item_notes/discussions pointing at the wrong name.
    // Renaming the new table (which nothing references) is safe; children still target
    // "items" and resolve to the rebuilt table. FK enforcement is off around the rebuild.
    await db.execAsync('PRAGMA foreign_keys=OFF');
    await db.execAsync(`
      BEGIN TRANSACTION;
      CREATE TABLE items_new (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('text','image','audio','file','bundle')),
        timestamp_created INTEGER NOT NULL,
        content TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        note TEXT,
        reviewed_flag INTEGER DEFAULT 0,
        archived_flag INTEGER DEFAULT 0
      );
      INSERT INTO items_new (id, type, timestamp_created, content, metadata_json, note, reviewed_flag, archived_flag)
        SELECT id, type, timestamp_created, content, metadata_json, note, reviewed_flag, archived_flag FROM items;
      DROP TABLE items;
      ALTER TABLE items_new RENAME TO items;
      COMMIT;
    `);
    await db.execAsync('PRAGMA foreign_keys=ON');
  }

  return db;
}

export type ItemType = 'text' | 'image' | 'audio' | 'file' | 'bundle';

export interface CapsuleItem {
  id: string;
  type: ItemType;
  timestamp_created: number;
  content: string;
  metadata_json: string;
  note: string | null;
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

  // Encrypt the payload at rest. For text items `content` is the note; for
  // image/audio it's the (already-encrypted) file path — both are ciphered here.
  const encContent = await encryptString(content);

  await database.runAsync(
    'INSERT INTO items (id, type, timestamp_created, content, metadata_json) VALUES (?, ?, ?, ?, ?)',
    [id, type, now, encContent, metaStr]
  );

  // Return the plaintext content to callers (they expect the original value).
  return { id, type, timestamp_created: now, content, metadata_json: metaStr, note: null, reviewed_flag: 0, archived_flag: 0 };
}

async function decryptRows(rows: CapsuleItem[]): Promise<CapsuleItem[]> {
  return Promise.all(
    rows.map(async row => {
      try {
        const content = await decryptString(row.content);
        const note = row.note ? await decryptString(row.note) : null;
        return { ...row, content, note };
      } catch {
        // Isolate a corrupt/undecryptable record so it can't break the whole load.
        return { ...row, content: '⚠️ Unreadable (could not decrypt)', note: row.note };
      }
    })
  );
}

export interface ItemNote {
  id: string;
  content: string;
  created: number;
}

/** Append a note to an item's timeline (encrypted at rest). */
export async function addItemNote(itemId: string, content: string): Promise<void> {
  if (!content.trim()) return;
  const database = await getDatabase();
  await database.runAsync(
    'INSERT INTO item_notes (id, item_id, content, created) VALUES (?, ?, ?, ?)',
    [await generateId(), itemId, await encryptString(content.trim()), Date.now()]
  );
}

/** An item's notes, oldest first. */
export async function getItemNotes(itemId: string): Promise<ItemNote[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ id: string; content: string; created: number }>(
    'SELECT id, content, created FROM item_notes WHERE item_id = ? ORDER BY created ASC', [itemId]
  );
  return Promise.all(rows.map(async r => ({ id: r.id, created: r.created, content: await decryptString(r.content) })));
}

export async function getUnreviewedItems(): Promise<CapsuleItem[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<CapsuleItem>(
    'SELECT * FROM items WHERE reviewed_flag = 0 AND archived_flag = 0 ORDER BY timestamp_created DESC'
  );
  return decryptRows(rows);
}

export async function getArchivedItems(): Promise<CapsuleItem[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<CapsuleItem>(
    'SELECT * FROM items WHERE archived_flag = 1 ORDER BY timestamp_created DESC'
  );
  return decryptRows(rows);
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

// Deleting a group deletes everything nested inside it — intentional (like deleting a
// folder). The destructive action is confirmed in the UI (ReviewScreen shows a
// count-aware "delete group and its N items" alert before calling this).
// Also removes the item's note history so nothing is left orphaned.
export async function deleteItem(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM item_notes WHERE item_id = ?', [id]);
  await database.runAsync('DELETE FROM items WHERE id = ?', [id]);
}

export async function deleteItems(ids: string[]): Promise<void> {
  if (!ids.length) return; // empty IN () is a SQL syntax error
  const database = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  await database.runAsync(`DELETE FROM item_notes WHERE item_id IN (${placeholders})`, ids);
  await database.runAsync(`DELETE FROM items WHERE id IN (${placeholders})`, ids);
}

export interface BundlePart {
  id?: string;
  type: ItemType; // 'bundle' = a nested group whose children are JSON in `content`
  content: string;
  meta: Record<string, unknown>;
  note: string | null;
  addedAt: number; // original capture time — powers the group timeline
  label?: string;
  notes?: ItemNote[]; // in-tree note history for a NESTED node (top-level items use item_notes)
}

/** Group/combine items under one 'bundle' parent (tree stored encrypted in content).
 *  group   = nest the others as children (structure preserved, groups stay groups)
 *  combine = "unsplit" the others and merge their leaves into the parent flat
 *  Parent = largest existing group, else oldest item. Premium feature. */
export async function groupItems(itemIds: string[], mode: GroupMode): Promise<void> {
  if (itemIds.length < 2) return;
  const database = await getDatabase();
  const placeholders = itemIds.map(() => '?').join(',');
  const rows = await database.getAllAsync<CapsuleItem>(
    `SELECT * FROM items WHERE id IN (${placeholders})`, itemIds
  );
  // Decrypt directly (NOT via decryptRows) so we can EXCLUDE any row whose content
  // won't decrypt. decryptRows substitutes a "⚠️ Unreadable" placeholder for display
  // resilience; baking that into the group and then deleting the original would destroy
  // still-recoverable ciphertext. A bad NOTE alone must not block grouping good content.
  const selected: CapsuleItem[] = [];
  for (const row of rows) {
    let content: string;
    try { content = await decryptString(row.content); }
    catch { continue; } // undecryptable content — leave this item untouched
    let note: string | null = null;
    try { note = row.note ? await decryptString(row.note) : null; }
    catch { note = null; }
    selected.push({ ...row, content, note });
  }
  if (selected.length < 2) return;
  const parent = pickParent(selected);
  const others = selected.filter(i => i.id !== parent.id);
  const children = buildGroupedChildren(parent, others, mode);

  // Encrypt outside the transaction (crypto, not DB). Then rewrite the parent row in
  // place as a group (keeps id/timestamp + its item_notes), reassign absorbed items'
  // notes onto the parent, and drop the absorbed rows — all atomically, so an
  // interruption can't leave partially-grouped data or orphaned notes.
  const encContent = await encryptString(JSON.stringify(children));
  const otherIds = others.map(o => o.id);
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      `UPDATE items SET type = 'bundle', content = ?, metadata_json = ? WHERE id = ?`,
      [encContent, JSON.stringify({ count: children.length }), parent.id]
    );
    if (otherIds.length) {
      const oph = otherIds.map(() => '?').join(',');
      await database.runAsync(`UPDATE item_notes SET item_id = ? WHERE item_id IN (${oph})`, [parent.id, ...otherIds]);

      // Preserve any AI-discussion history from absorbed items: funnel their messages
      // and context files under a single parent discussion, so the item-delete cascade
      // below doesn't silently destroy that transcript. (Discussions are one-per-item,
      // hence the merge rather than a reassign.)
      const absorbed = await database.getAllAsync<{ id: string; outcome: string | null }>(
        `SELECT id, outcome FROM discussions WHERE item_id IN (${oph})`, otherIds
      );
      if (absorbed.length) {
        let parentDisc = await database.getFirstAsync<{ id: string }>(
          'SELECT id FROM discussions WHERE item_id = ? LIMIT 1', [parent.id]
        );
        let parentDiscId = parentDisc?.id;
        if (!parentDiscId) {
          parentDiscId = await generateId();
          const now = Date.now();
          await database.runAsync(
            'INSERT OR IGNORE INTO discussions (id, item_id, created, updated) VALUES (?, ?, ?, ?)',
            [parentDiscId, parent.id, now, now]
          );
        }
        // Preserve each absorbed discussion's OUTCOME by folding it into the parent as a
        // message (the encrypted outcome blob is a valid encrypted message content — same
        // key — so no decrypt/re-encrypt needed). Without this the cascade would drop them.
        for (const d of absorbed) {
          if (d.id !== parentDiscId && d.outcome) {
            await database.runAsync(
              'INSERT INTO discussion_messages (id, discussion_id, role, content, created) VALUES (?, ?, ?, ?, ?)',
              [await generateId(), parentDiscId, 'assistant', d.outcome, Date.now()]
            );
          }
        }
        const discIds = absorbed.map(d => d.id).filter(id => id !== parentDiscId);
        if (discIds.length) {
          const dph = discIds.map(() => '?').join(',');
          await database.runAsync(`UPDATE discussion_messages SET discussion_id = ? WHERE discussion_id IN (${dph})`, [parentDiscId, ...discIds]);
          await database.runAsync(`UPDATE context_files SET discussion_id = ? WHERE discussion_id IN (${dph})`, [parentDiscId, ...discIds]);
          // The now-empty absorbed discussion shells are removed by the cascade below.
        }
      }

      await database.runAsync(`DELETE FROM items WHERE id IN (${oph})`, otherIds);
    }
  });
}

/** Back-compat: a plain "bundle these" is a flat combine. */
export async function createBundle(itemIds: string[]): Promise<void> {
  return groupItems(itemIds, 'combine');
}

/** Append a note to a NESTED node (identified by nodeId) inside a top-level group
 *  (rootItemId), persisting the whole re-serialized tree. Lets nested groups/items
 *  carry their own note timeline, editable like a top-level item. */
export async function addNestedNote(rootItemId: string, nodeId: string, content: string): Promise<void> {
  if (!content.trim()) return;
  const database = await getDatabase();
  const row = await database.getFirstAsync<CapsuleItem>('SELECT * FROM items WHERE id = ?', [rootItemId]);
  if (!row) return;
  const [dec] = await decryptRows([row]);
  let children: BundlePart[];
  try { children = JSON.parse(dec.content) as BundlePart[]; } catch { return; }
  const note: ItemNote = { id: await generateId(), content: content.trim(), created: Date.now() };
  if (!addNoteToTree(children, nodeId, note)) return; // node not found — no-op
  const enc = await encryptString(JSON.stringify(children));
  await database.runAsync('UPDATE items SET content = ? WHERE id = ?', [enc, rootItemId]);
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

// ---------------------------------------------------------------------------
// PAID-TIER FOUNDATION — AI discussion storage (schema-ready, not yet wired to
// any AI backend). Discussion transcript + outcome + generated context files,
// linked per idea. Message content and outcome are encrypted at rest.
// The AI backend (via the AI Gateway) and custom prompts are a future milestone.
// ---------------------------------------------------------------------------

export type MessageRole = 'user' | 'assistant' | 'system';

export interface DiscussionMessage {
  id: string;
  discussion_id: string;
  role: MessageRole;
  content: string;
  created: number;
}

export interface Discussion {
  id: string;
  item_id: string;
  created: number;
  updated: number;
  outcome: string | null;
  messages: DiscussionMessage[];
}

/** Get the existing discussion for an idea, or create one. Returns the discussion id. */
export async function ensureDiscussion(itemId: string): Promise<string> {
  const database = await getDatabase();
  const existing = await database.getFirstAsync<{ id: string }>(
    'SELECT id FROM discussions WHERE item_id = ? LIMIT 1', [itemId]
  );
  if (existing) return existing.id;
  const id = await generateId();
  const now = Date.now();
  // INSERT OR IGNORE + re-read: with the UNIQUE(item_id) index, if a concurrent caller
  // already inserted, our insert is ignored and we return the existing (winning) row.
  await database.runAsync(
    'INSERT OR IGNORE INTO discussions (id, item_id, created, updated) VALUES (?, ?, ?, ?)',
    [id, itemId, now, now]
  );
  const row = await database.getFirstAsync<{ id: string }>(
    'SELECT id FROM discussions WHERE item_id = ? LIMIT 1', [itemId]
  );
  return row?.id ?? id;
}

export async function addDiscussionMessage(discussionId: string, role: MessageRole, content: string): Promise<void> {
  const database = await getDatabase();
  const id = await generateId();
  const now = Date.now();
  await database.runAsync(
    'INSERT INTO discussion_messages (id, discussion_id, role, content, created) VALUES (?, ?, ?, ?, ?)',
    [id, discussionId, role, await encryptString(content), now]
  );
  await database.runAsync('UPDATE discussions SET updated = ? WHERE id = ?', [now, discussionId]);
}

export async function setDiscussionOutcome(discussionId: string, outcome: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE discussions SET outcome = ?, updated = ? WHERE id = ?',
    [await encryptString(outcome), Date.now(), discussionId]
  );
}

export async function addContextFile(discussionId: string, encPath: string, filename: string, mime: string): Promise<void> {
  const database = await getDatabase();
  const id = await generateId();
  await database.runAsync(
    'INSERT INTO context_files (id, discussion_id, path, filename, mime, created) VALUES (?, ?, ?, ?, ?, ?)',
    [id, discussionId, encPath, filename, mime, Date.now()]
  );
}

export async function getDiscussion(itemId: string): Promise<Discussion | null> {
  const database = await getDatabase();
  const disc = await database.getFirstAsync<Omit<Discussion, 'messages'>>(
    'SELECT id, item_id, created, updated, outcome FROM discussions WHERE item_id = ? LIMIT 1', [itemId]
  );
  if (!disc) return null;
  const rows = await database.getAllAsync<DiscussionMessage>(
    'SELECT * FROM discussion_messages WHERE discussion_id = ? ORDER BY created ASC', [disc.id]
  );
  const messages = await Promise.all(
    rows.map(async m => ({ ...m, content: await decryptString(m.content) }))
  );
  const outcome = disc.outcome ? await decryptString(disc.outcome) : null;
  return { ...disc, outcome, messages };
}
