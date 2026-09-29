/**
 * WEB-ONLY database (Metro resolves this over database.ts for the web build).
 * expo-sqlite has no web native module, so the interactive web DEMO uses a plain
 * store backed by localStorage so inputs persist across reloads. Native iOS/Android
 * use the real encrypted SQLite in database.ts — this file is never bundled for them.
 *
 * The API mirrors database.ts. Content is stored as-is (the throwaway browser store
 * isn't encrypted). NOTE: image/audio captured on web are blob: URLs which the browser
 * revokes on reload, so media previews may not survive a reload; text/notes/settings do.
 */
import * as Crypto from 'expo-crypto';
import { pickParent, buildGroupedChildren, addNoteToTree, type GroupMode } from '../lib/bundleTree';

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

export type MessageRole = 'user' | 'assistant' | 'system';
export interface DiscussionMessage { id: string; discussion_id: string; role: MessageRole; content: string; created: number; }
export interface Discussion { id: string; item_id: string; created: number; updated: number; outcome: string | null; messages: DiscussionMessage[]; }
export interface ItemNote { id: string; content: string; created: number; }
export interface BundlePart { id?: string; type: ItemType; content: string; meta: Record<string, unknown>; note: string | null; addedAt: number; label?: string; notes?: ItemNote[]; }

let items: CapsuleItem[] = [];
const settings = new Map<string, string>();
const discussions: Discussion[] = [];
const notesByItem = new Map<string, ItemNote[]>();

// Persist the demo DB to localStorage so web inputs survive reloads.
const LS_KEY = 'capsule_web_db_v1';
function save() {
  try {
    globalThis.localStorage?.setItem(LS_KEY, JSON.stringify({
      items,
      settings: [...settings.entries()],
      notes: [...notesByItem.entries()],
      discussions,
    }));
  } catch { /* ignore quota/availability */ }
}
(function load() {
  try {
    const raw = globalThis.localStorage?.getItem(LS_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (Array.isArray(d.items)) items = d.items;
    if (Array.isArray(d.settings)) for (const [k, v] of d.settings) settings.set(k, v);
    if (Array.isArray(d.notes)) for (const [k, v] of d.notes) notesByItem.set(k, v);
    if (Array.isArray(d.discussions)) discussions.push(...d.discussions);
  } catch { /* ignore */ }
})();

export async function getDatabase(): Promise<unknown> {
  return { web: true };
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
  const item: CapsuleItem = {
    id: await generateId(),
    type,
    timestamp_created: Date.now(),
    content,
    metadata_json: JSON.stringify(metadata),
    note: null,
    reviewed_flag: 0,
    archived_flag: 0,
  };
  items.unshift(item);
  save();
  return item;
}

export async function addItemNote(itemId: string, content: string): Promise<void> {
  if (!content.trim()) return;
  const list = notesByItem.get(itemId) || [];
  list.push({ id: await generateId(), content: content.trim(), created: Date.now() });
  notesByItem.set(itemId, list);
  save();
}

export async function getItemNotes(itemId: string): Promise<ItemNote[]> {
  return [...(notesByItem.get(itemId) || [])].sort((a, b) => a.created - b.created);
}

export async function getUnreviewedItems(): Promise<CapsuleItem[]> {
  return items
    .filter(i => i.reviewed_flag === 0 && i.archived_flag === 0)
    .sort((a, b) => b.timestamp_created - a.timestamp_created);
}

export async function getArchivedItems(): Promise<CapsuleItem[]> {
  return items.filter(i => i.archived_flag === 1).sort((a, b) => b.timestamp_created - a.timestamp_created);
}

export async function markReviewed(ids: string[]): Promise<void> {
  items.forEach(i => { if (ids.includes(i.id)) i.reviewed_flag = 1; });
  save();
}

export async function archiveItem(id: string): Promise<void> {
  items.forEach(i => { if (i.id === id) { i.archived_flag = 1; i.reviewed_flag = 1; } });
  save();
}

// Deleting a group deletes everything nested inside it — this is intentional (like
// deleting a folder). The destructive action is confirmed in the UI (ReviewScreen
// shows a count-aware "delete group and its N items" alert before calling these).
export async function deleteItem(id: string): Promise<void> {
  items = items.filter(i => i.id !== id);
  notesByItem.delete(id); // drop note history so nothing is orphaned
  save();
}

export async function deleteItems(ids: string[]): Promise<void> {
  items = items.filter(i => !ids.includes(i.id));
  for (const id of ids) notesByItem.delete(id);
  save();
}

export async function groupItems(itemIds: string[], mode: GroupMode): Promise<void> {
  if (itemIds.length < 2) return;
  const selected = items.filter(i => itemIds.includes(i.id));
  if (selected.length < 2) return;
  const parent = pickParent(selected);
  const others = selected.filter(i => i.id !== parent.id);
  const children = buildGroupedChildren(parent, others, mode);

  // Rewrite the parent in place as a group — keeps its id + timestamp so it
  // stays the oldest anchor and its own notes/history remain attached.
  const idx = items.findIndex(i => i.id === parent.id);
  if (idx >= 0) {
    items[idx] = { ...items[idx], type: 'bundle', content: JSON.stringify(children), metadata_json: JSON.stringify({ count: children.length }) };
  }
  // Move absorbed items' note histories onto the parent so they aren't orphaned.
  const parentNotes = notesByItem.get(parent.id) || [];
  for (const o of others) {
    const on = notesByItem.get(o.id);
    if (on && on.length) { parentNotes.push(...on); notesByItem.delete(o.id); }
  }
  if (parentNotes.length) notesByItem.set(parent.id, parentNotes);

  const otherIds = new Set(others.map(o => o.id));
  items = items.filter(i => !otherIds.has(i.id));
  save();
}

/** Back-compat: a plain "bundle these" is a flat combine. */
export async function createBundle(itemIds: string[]): Promise<void> {
  return groupItems(itemIds, 'combine');
}

/** Append a note to a NESTED node (nodeId) inside a top-level group (rootItemId). */
export async function addNestedNote(rootItemId: string, nodeId: string, content: string): Promise<void> {
  if (!content.trim()) return;
  const item = items.find(i => i.id === rootItemId);
  if (!item) return;
  let children: BundlePart[];
  try { children = JSON.parse(item.content) as BundlePart[]; } catch { return; }
  const note: ItemNote = { id: await generateId(), content: content.trim(), created: Date.now() };
  if (!addNoteToTree(children, nodeId, note)) return;
  item.content = JSON.stringify(children);
  save();
}

export async function getItemCount(): Promise<number> {
  return items.length;
}

export async function getStorageStats(): Promise<{ text: number; image: number; audio: number; file: number; total: number }> {
  const stats = { text: 0, image: 0, audio: 0, file: 0, total: 0 };
  for (const i of items) {
    if (i.type in stats) (stats as Record<string, number>)[i.type] += 1;
    stats.total += 1;
  }
  return stats;
}

export async function getSetting(key: string): Promise<string | null> {
  return settings.has(key) ? settings.get(key)! : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  settings.set(key, value);
  save();
}

// --- Paid-tier discussion foundation (demo parity) ---
export async function ensureDiscussion(itemId: string): Promise<string> {
  const existing = discussions.find(d => d.item_id === itemId);
  if (existing) return existing.id;
  const id = await generateId();
  discussions.push({ id, item_id: itemId, created: Date.now(), updated: Date.now(), outcome: null, messages: [] });
  save();
  return id;
}

export async function addDiscussionMessage(discussionId: string, role: MessageRole, content: string): Promise<void> {
  const d = discussions.find(x => x.id === discussionId);
  if (!d) return;
  d.messages.push({ id: await generateId(), discussion_id: discussionId, role, content, created: Date.now() });
  d.updated = Date.now();
  save();
}

export async function setDiscussionOutcome(discussionId: string, outcome: string): Promise<void> {
  const d = discussions.find(x => x.id === discussionId);
  if (d) { d.outcome = outcome; d.updated = Date.now(); save(); }
}

export async function addContextFile(): Promise<void> {
  /* no-op in the web demo */
}

export async function getDiscussion(itemId: string): Promise<Discussion | null> {
  return discussions.find(d => d.item_id === itemId) ?? null;
}
