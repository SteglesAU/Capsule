// Pure tree helpers for grouping. A "group" is an item of type 'bundle' whose
// `content` is JSON.stringify(BundlePart[]) — the same shape at every level, so
// groups nest recursively. Two operations:
//   • group   → the added item/group is nested as a child (structure preserved)
//   • combine → the added group is "unsplit": its leaves are merged in flat
// The parent is the largest existing group, else the oldest item — so we never
// bury a big group inside a small one, and the anchor keeps the oldest identity.
import type { BundlePart, CapsuleItem, ItemNote } from '../db/database';

export type GroupMode = 'group' | 'combine';

// Nesting is capped: you can group items (a group), and nest a group inside another
// group (2 levels), but no deeper. A group whose nesting would exceed this is flattened
// in instead of nested, so items are never lost — just not nested a third level deep.
export const MAX_GROUP_DEPTH = 2;

/** A group's children, or null if the content isn't a valid BundlePart array. Note that
 *  JSON.parse succeeding doesn't guarantee an array (e.g. `{}` or `"text"`), so we check. */
export function childrenOf(part: { type: string; content: string }): BundlePart[] | null {
  if (part.type !== 'bundle') return null;
  try { const p = JSON.parse(part.content); return Array.isArray(p) ? (p as BundlePart[]) : null; }
  catch { return null; }
}

/** Group-nesting depth of a node: leaf = 0, a group of leaves = 1, a group containing a group = 2. */
export function partDepth(part: BundlePart): number {
  if (part.type !== 'bundle') return 0;
  const kids = childrenOf(part);
  return kids ? 1 + kids.reduce((m, c) => Math.max(m, partDepth(c)), 0) : 1;
}

export function itemDepth(it: CapsuleItem): number {
  return partDepth(itemToNode(it));
}

function safeMeta(s: string | undefined): Record<string, unknown> {
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}

/** Total leaf (non-group) descendants of a part. */
export function partLeafCount(part: BundlePart): number {
  if (part.type !== 'bundle') return 1;
  const kids = childrenOf(part);
  return kids ? kids.reduce((n, c) => n + partLeafCount(c), 0) : 1;
}

/** Every leaf part beneath a node, in order (used by combine to "unsplit" a group).
 *  If a group's content is malformed, keep the node itself rather than dropping it —
 *  combine must never silently lose data. */
export function flattenLeaves(part: BundlePart): BundlePart[] {
  if (part.type !== 'bundle') return [part];
  const kids = childrenOf(part);
  return kids ? kids.flatMap(flattenLeaves) : [part];
}

/** Represent a stored item as a bundle-tree node (a group keeps its children JSON in content). */
export function itemToNode(it: CapsuleItem): BundlePart {
  return {
    id: it.id,
    type: it.type,
    content: it.content,
    meta: safeMeta(it.metadata_json),
    note: it.note,
    addedAt: it.timestamp_created,
  };
}

export function itemLeafCount(it: CapsuleItem): number {
  return partLeafCount(itemToNode(it));
}

/** Parent = largest group among the selection; if none are groups, the oldest item. */
export function pickParent(selected: CapsuleItem[]): CapsuleItem {
  const groups = selected.filter(i => i.type === 'bundle');
  const pool = groups.length ? groups : selected;
  return [...pool].sort((a, b) => itemLeafCount(b) - itemLeafCount(a) || a.timestamp_created - b.timestamp_created)[0];
}

/** Find a node anywhere in a bundle tree by id (depth-first). */
export function findNode(children: BundlePart[], id: string): BundlePart | null {
  for (const c of children) {
    if (c.id === id) return c;
    const kids = childrenOf(c);
    if (kids) {
      const found = findNode(kids, id);
      if (found) return found;
    }
  }
  return null;
}

/** Append a note to the node with the given id, re-serializing nested group content
 *  along the path. Mutates `children` in place. Returns true if the node was found. */
export function addNoteToTree(children: BundlePart[], id: string, note: ItemNote): boolean {
  for (const c of children) {
    if (c.id === id) { (c.notes = c.notes || []).push(note); return true; }
    const kids = childrenOf(c);
    if (kids && addNoteToTree(kids, id, note)) { c.content = JSON.stringify(kids); return true; }
  }
  return false;
}

/** The parent's new children[] after adding `others` under it. Pure — storage is the caller's job. */
export function buildGroupedChildren(parent: CapsuleItem, others: CapsuleItem[], mode: GroupMode): BundlePart[] {
  // Parent's starting children. A plain item becomes a group whose first child is the
  // item itself. A group contributes its existing children — but malformed/non-array
  // content must NOT be discarded (the parent row gets rewritten + absorbed items
  // deleted), so preserve it as a nested node instead of losing it.
  const children: BundlePart[] = parent.type === 'bundle'
    ? (childrenOf(parent) ?? [itemToNode(parent)])
    : [itemToNode(parent)];
  for (const o of others) {
    const node = itemToNode(o);
    // 'combine' always flattens. 'group' nests — UNLESS nesting this node would push the
    // tree past MAX_GROUP_DEPTH (i.e. it's already a group-containing-a-group), in which
    // case we flatten its leaves in rather than nest a third level. Nesting a node of
    // depth d makes the parent (d+1); parent must stay <= MAX_GROUP_DEPTH.
    if (mode === 'combine' || partDepth(node) + 1 > MAX_GROUP_DEPTH) {
      children.push(...flattenLeaves(node));
    } else {
      children.push(node); // group: nest (a group stays a group)
    }
  }
  return children;
}
