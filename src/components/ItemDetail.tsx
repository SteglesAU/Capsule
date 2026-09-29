import { useState, useEffect } from 'react';
import {
  View, Text, SafeAreaView, ScrollView, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Image, ActivityIndicator,
} from 'react-native';
import { ChevronLeft, ChevronRight, StickyNote, Send, Box as BoxIcon, Layers, Sparkles } from 'lucide-react-native';
import { CapsuleItem, BundlePart, ItemNote, addItemNote, getItemNotes, addNestedNote } from '../db/database';
import { findNode, addNoteToTree } from '../lib/bundleTree';
import { decryptFileToTemp, isEncrypted } from '../lib/crypto';
import { useSettingsStore } from '../stores/settingsStore';

function fmt(ts: number): string {
  const d = new Date(ts);
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

function safeParse(s: string): BundlePart[] {
  try { return JSON.parse(s) as BundlePart[]; } catch { return []; }
}
function safeMeta(s: string | undefined): Record<string, unknown> {
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}

/** Small media renderer. Image parts decrypt to a temp URI, tied to their source
 *  content so a recycled instance never briefly shows another part's image. */
function MediaPart({ type, content, meta }: { type: string; content: string; meta: Record<string, unknown> }) {
  const [decoded, setDecoded] = useState<{ content: string; uri: string } | null>(null);
  useEffect(() => {
    if (type !== 'image') return;
    let active = true;
    const src = content;
    (isEncrypted(src) ? decryptFileToTemp(src) : Promise.resolve(src))
      .then(u => { if (active) setDecoded({ content: src, uri: u }); })
      .catch(() => { if (active) setDecoded(null); });
    return () => { active = false; };
  }, [type, content]);
  const uri = decoded && decoded.content === content ? decoded.uri : null;

  if (type === 'bundle') {
    const kids = safeParse(content);
    return (
      <View className="border-l-2 border-purple-500/40 pl-3 gap-2">
        <Text className="text-purple-300/90 text-[10px] uppercase tracking-wide">▸ Group · {kids.length} idea{kids.length !== 1 ? 's' : ''}</Text>
        {kids.map((k, i) => <MediaPart key={i} type={k.type} content={k.content} meta={k.meta} />)}
      </View>
    );
  }
  if (type === 'text') return <Text className="text-white text-sm leading-5">{content}</Text>;
  if (type === 'image') return uri
    ? <Image source={{ uri }} className="w-full h-44 rounded-lg" resizeMode="cover" />
    : <View className="w-full h-44 rounded-lg bg-white/5 items-center justify-center"><ActivityIndicator color="#60A5FA" /></View>;
  if (type === 'audio') return <Text className="text-gray-300 text-sm">🎤 Audio note{meta.durationSeconds ? ` — ${meta.durationSeconds}s` : ''}</Text>;
  return null;
}

type TimelineEvent =
  | { ts: number; kind: 'created' }
  | { ts: number; kind: 'part'; part: BundlePart }
  | { ts: number; kind: 'note'; content: string };

/** One detail surface — used for both a top-level item/group and a drilled-in nested
 *  group. Shows the content/timeline and an add-note composer. `onOpenGroup` (when
 *  provided) makes nested-group entries tappable to drill in. */
function DetailBody({
  title, isBundle, leaf, parts, createdAt, notes, showAI, premium,
  draft, setDraft, onSubmitNote, onOpenGroup, onClose,
}: {
  title: string;
  isBundle: boolean;
  leaf?: { type: string; content: string; meta: Record<string, unknown> };
  parts: BundlePart[];
  createdAt: number;
  notes: ItemNote[];
  showAI: boolean;
  premium: boolean;
  draft: string;
  setDraft: (s: string) => void;
  onSubmitNote: () => void;
  onOpenGroup?: (part: BundlePart) => void;
  onClose: () => void;
}) {
  const events: TimelineEvent[] = [
    { ts: createdAt, kind: 'created' as const },
    ...parts.map(p => ({ ts: p.addedAt, kind: 'part' as const, part: p })),
    ...notes.map(n => ({ ts: n.created, kind: 'note' as const, content: n.content })),
  ].sort((a, b) => a.ts - b.ts);

  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-row items-center px-4 pt-4 pb-3 border-b border-gray-800">
        <TouchableOpacity onPress={onClose} className="mr-2 p-1"><ChevronLeft size={26} color="#9CA3AF" /></TouchableOpacity>
        {isBundle ? <Layers size={18} color="#A78BFA" /> : <BoxIcon size={18} color="#60A5FA" />}
        <Text className="text-white text-lg font-bold ml-2">{title}</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
          {leaf ? (
            <View className="bg-gray-800/60 rounded-xl p-4 mb-6">
              <MediaPart type={leaf.type} content={leaf.content} meta={leaf.meta} />
            </View>
          ) : null}

          {showAI && premium && (
            <TouchableOpacity className="flex-row items-center justify-center gap-2 bg-purple-600/20 border border-purple-600/40 rounded-xl py-3 mb-6" activeOpacity={0.7} onPress={() => {}}>
              <Sparkles size={16} color="#A78BFA" />
              <Text className="text-purple-300 font-medium">Discuss with AI</Text>
              <Text className="text-purple-500 text-[10px] uppercase">soon</Text>
            </TouchableOpacity>
          )}

          <Text className="text-gray-500 text-xs uppercase tracking-wider mb-3">Timeline</Text>
          <View>
            {events.map((e, i) => (
              <View key={i} className="flex-row gap-3 mb-3">
                <View className="items-center">
                  <View className={`w-2.5 h-2.5 rounded-full mt-1.5 ${e.kind === 'note' ? 'bg-amber-400' : e.kind === 'part' ? 'bg-purple-400' : 'bg-green-400'}`} />
                  {i < events.length - 1 && <View className="flex-1 w-px bg-gray-700 my-1" />}
                </View>
                <View className="flex-1 pb-1">
                  <Text className="text-gray-500 text-[11px] mb-1">
                    {e.kind === 'created' ? 'Captured' : e.kind === 'part' ? (e.part.type === 'bundle' ? 'Group added' : 'Idea added') : 'Note'} · {fmt(e.ts)}
                  </Text>
                  {e.kind === 'note' && (
                    <View className="bg-amber-400/10 rounded-lg px-3 py-2 flex-row gap-2">
                      <StickyNote size={13} color="#FBBF24" />
                      <Text className="text-amber-100 text-sm flex-1">{e.content}</Text>
                    </View>
                  )}
                  {e.kind === 'part' && (
                    e.part.type === 'bundle' && onOpenGroup ? (
                      <TouchableOpacity
                        onPress={() => onOpenGroup(e.part)}
                        className="bg-gray-800/60 rounded-lg p-3 flex-row items-center"
                        activeOpacity={0.7}
                      >
                        <View className="flex-1">
                          <MediaPart type={e.part.type} content={e.part.content} meta={e.part.meta} />
                          <Text className="text-purple-300/70 text-[10px] mt-2">
                            Tap to open{e.part.notes?.length ? ` · ${e.part.notes.length} note${e.part.notes.length !== 1 ? 's' : ''}` : ''}
                          </Text>
                        </View>
                        <ChevronRight size={18} color="#6B7280" />
                      </TouchableOpacity>
                    ) : (
                      <View className="bg-gray-800/60 rounded-lg p-3">
                        <MediaPart type={e.part.type} content={e.part.content} meta={e.part.meta} />
                      </View>
                    )
                  )}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        <View className="flex-row items-end gap-2 px-4 py-3 border-t border-gray-800">
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Add a note…"
            placeholderTextColor="#6B7280"
            multiline
            className="flex-1 text-white text-base max-h-24 bg-gray-800/60 rounded-2xl px-4 py-2.5"
          />
          <TouchableOpacity onPress={onSubmitNote} disabled={!draft.trim()} className={`w-11 h-11 rounded-full items-center justify-center ${draft.trim() ? 'bg-blue-600' : 'bg-gray-800'}`} activeOpacity={0.8}>
            <Send size={18} color="white" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function ItemDetail({ item, onClose, onChanged }: { item: CapsuleItem; onClose: () => void; onChanged: () => void }) {
  const premium = useSettingsStore(s => s.premium);
  const [notes, setNotes] = useState<ItemNote[]>([]);
  const [draft, setDraft] = useState('');
  const [nestedDraft, setNestedDraft] = useState('');
  const [parts, setParts] = useState<BundlePart[]>(() => (item.type === 'bundle' ? safeParse(item.content) : []));
  const [drillId, setDrillId] = useState<string | null>(null);

  // Reparse if the underlying content changes (e.g. re-opened after a grouping change).
  useEffect(() => { setParts(item.type === 'bundle' ? safeParse(item.content) : []); }, [item.id, item.content]);

  const load = async () => setNotes(await getItemNotes(item.id));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [item.id]);

  const submitNote = async () => {
    if (!draft.trim()) return;
    await addItemNote(item.id, draft);
    setDraft('');
    await load();
    onChanged();
  };

  const isBundle = item.type === 'bundle';
  const drill = drillId ? findNode(parts, drillId) : null;
  const drillChildren = drill && drill.type === 'bundle' ? safeParse(drill.content) : [];

  const submitNestedNote = async () => {
    if (!nestedDraft.trim() || !drill?.id) return;
    const text = nestedDraft.trim();
    const nodeId = drill.id;
    await addNestedNote(item.id, nodeId, text);
    // Optimistically reflect the note in the in-memory tree so the drill view updates
    // immediately (the persisted copy is reloaded next time the detail is opened).
    setParts(prev => {
      const copy: BundlePart[] = JSON.parse(JSON.stringify(prev));
      addNoteToTree(copy, nodeId, { id: `local-${text.length}-${copy.length}`, content: text, created: Date.now() });
      return copy;
    });
    setNestedDraft('');
    onChanged();
  };

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }} className="bg-black">
      <DetailBody
        title={isBundle ? `Group · ${parts.length} idea${parts.length !== 1 ? 's' : ''}` : 'Idea'}
        isBundle={isBundle}
        leaf={isBundle ? undefined : { type: item.type, content: item.content, meta: safeMeta(item.metadata_json) }}
        parts={parts}
        createdAt={item.timestamp_created}
        notes={notes}
        showAI
        premium={premium}
        draft={draft}
        setDraft={setDraft}
        onSubmitNote={submitNote}
        onOpenGroup={p => p.id && setDrillId(p.id)}
        onClose={onClose}
      />

      {drill && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60 }} className="bg-black">
          <DetailBody
            title={`Group · ${drillChildren.length} idea${drillChildren.length !== 1 ? 's' : ''}`}
            isBundle
            parts={drillChildren}
            createdAt={drill.addedAt}
            notes={drill.notes || []}
            showAI={false}
            premium={premium}
            draft={nestedDraft}
            setDraft={setNestedDraft}
            onSubmitNote={submitNestedNote}
            // New data is capped at depth 2, but allow drilling deeper for any legacy
            // group so no level is ever unreachable (findNode/addNoteToTree recurse by id).
            onOpenGroup={p => p.id && setDrillId(p.id)}
            onClose={() => { setDrillId(null); setNestedDraft(''); }}
          />
        </View>
      )}
    </View>
  );
}
