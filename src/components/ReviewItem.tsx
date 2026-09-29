import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { Trash2, Archive, Share2, Type, Camera, Mic, File, Layers, CheckCircle2, Circle, ChevronRight } from 'lucide-react-native';
import { CapsuleItem, BundlePart } from '../db/database';
import { decryptFileToTemp, isEncrypted } from '../lib/crypto';

interface Props {
  item: CapsuleItem;
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
  onExport: (item: CapsuleItem) => void;
  onOpenDetail: (item: CapsuleItem) => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

/** Renders one part of a bundle (image parts decrypt to a temp URI; groups nest recursively). */
function BundlePartView({ part, depth = 0 }: { part: BundlePart; depth?: number }) {
  // Tie the decoded URI to its source content so a recycled/reordered part can never
  // briefly show a different part's image (index keys make recycling possible).
  const [decoded, setDecoded] = useState<{ content: string; uri: string } | null>(null);
  useEffect(() => {
    if (part.type !== 'image') return;
    let active = true;
    const src = part.content;
    (isEncrypted(src) ? decryptFileToTemp(src) : Promise.resolve(src))
      .then(u => { if (active) setDecoded({ content: src, uri: u }); })
      .catch(() => { if (active) setDecoded(null); });
    return () => { active = false; };
  }, [part.type, part.content]);
  const uri = decoded && decoded.content === part.content ? decoded.uri : null;

  const meta = (part.meta || {}) as Record<string, unknown>;
  // A nested group: render its children indented so grouped-in data stays visible
  // (previously this returned null → the group's contents looked deleted).
  if (part.type === 'bundle') {
    let kids: BundlePart[] = [];
    try { kids = JSON.parse(part.content); } catch { /* ignore */ }
    return (
      <View className="border-l-2 border-purple-500/40 pl-2 mb-2">
        <Text className="text-purple-300/90 text-[10px] uppercase tracking-wide mb-1">
          ▸ Group · {kids.length} item{kids.length !== 1 ? 's' : ''}
        </Text>
        {kids.map((k, i) => <BundlePartView key={i} part={k} depth={depth + 1} />)}
      </View>
    );
  }
  if (part.type === 'text') return <Text className="text-white text-sm leading-5 mb-2" numberOfLines={6}>{part.content}</Text>;
  if (part.type === 'image') return uri
    ? <Image source={{ uri }} className="w-full h-40 rounded-lg mb-2" resizeMode="cover" />
    : <View className="w-full h-40 rounded-lg bg-white/5 items-center justify-center mb-2"><ActivityIndicator color="#60A5FA" /></View>;
  if (part.type === 'audio') return <Text className="text-gray-300 text-sm mb-2">🎤 Audio note{meta.durationSeconds ? ` — ${meta.durationSeconds}s` : ''}</Text>;
  return null;
}

const TYPE_ICONS = {
  text: { icon: Type, color: '#60A5FA' },
  image: { icon: Camera, color: '#34D399' },
  audio: { icon: Mic, color: '#F472B6' },
  file: { icon: File, color: '#FBBF24' },
  bundle: { icon: Layers, color: '#A78BFA' },
};

export function ReviewItem({ item, onDelete, onArchive, onExport, onOpenDetail, selectMode, selected, onToggleSelect }: Props) {
  const typeInfo = TYPE_ICONS[item.type];
  const Icon = typeInfo.icon;
  const meta = JSON.parse(item.metadata_json || '{}');
  const date = new Date(item.timestamp_created);

  // Encrypted images decrypt to a temp URI; key the URI to the source content so a
  // reused component instance can never briefly show a previous item's image.
  const [decoded, setDecoded] = useState<{ content: string; uri: string } | null>(null);
  useEffect(() => {
    if (item.type !== 'image') return;
    let active = true;
    const src = item.content;
    (isEncrypted(src) ? decryptFileToTemp(src) : Promise.resolve(src))
      .then(uri => { if (active) setDecoded({ content: src, uri }); })
      .catch(() => { if (active) setDecoded(null); });
    return () => { active = false; };
  }, [item.type, item.content]);
  const imageUri = decoded && decoded.content === item.content ? decoded.uri : null;

  return (
    <TouchableOpacity
      className={`bg-gray-800 rounded-xl p-4 mb-3 ${selected ? 'border border-purple-500' : ''}`}
      activeOpacity={0.7}
      onPress={() => (selectMode ? onToggleSelect?.(item.id) : onOpenDetail(item))}
    >
      <View className="flex-row items-start gap-3">
        {selectMode && (
          <View className="mt-1">
            {selected ? <CheckCircle2 size={22} color="#A78BFA" /> : <Circle size={22} color="#4B5563" />}
          </View>
        )}
        <View className="w-10 h-10 rounded-lg bg-white/5 items-center justify-center mt-0.5">
          <Icon size={20} color={typeInfo.color} />
        </View>

        <View className="flex-1">
          {item.type === 'text' && (
            <Text className="text-white text-base leading-6" numberOfLines={6}>{item.content}</Text>
          )}
          {item.type === 'image' && (
            imageUri ? (
              <Image source={{ uri: imageUri }} className="w-full h-48 rounded-lg" resizeMode="cover" />
            ) : (
              <View className="w-full h-48 rounded-lg bg-white/5 items-center justify-center">
                <ActivityIndicator color="#60A5FA" />
              </View>
            )
          )}
          {item.type === 'audio' && (
            <Text className="text-white text-base">
              Audio note — {meta.durationSeconds ? `${Math.floor(meta.durationSeconds / 60)}:${(meta.durationSeconds % 60).toString().padStart(2, '0')}` : 'Unknown duration'}
            </Text>
          )}
          {item.type === 'bundle' && (() => {
            let parts: BundlePart[] = [];
            try { parts = JSON.parse(item.content); } catch { /* ignore */ }
            return (
              <View>
                <Text className="text-purple-300 text-[11px] uppercase tracking-wide mb-2">Group · {parts.length} item{parts.length !== 1 ? 's' : ''}</Text>
                {parts.map((p, i) => <BundlePartView key={i} part={p} />)}
              </View>
            );
          })()}

          <Text className="text-gray-500 text-xs mt-2">
            {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            {' at '}
            {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </Text>
        </View>

        {!selectMode && <ChevronRight size={18} color="#4B5563" style={{ marginTop: 2 }} />}
      </View>

      {!selectMode && (
        <View className="flex-row justify-end gap-2 mt-3 pt-3 border-t border-gray-700">
          <TouchableOpacity onPress={() => onExport(item)} className="flex-row items-center px-3 py-1.5 rounded-lg bg-gray-700">
            <Share2 size={14} color="#9CA3AF" />
            <Text className="text-gray-400 text-xs ml-1.5">Export</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onArchive(item.id)} className="flex-row items-center px-3 py-1.5 rounded-lg bg-gray-700">
            <Archive size={14} color="#9CA3AF" />
            <Text className="text-gray-400 text-xs ml-1.5">Archive</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onDelete(item.id)} className="flex-row items-center px-3 py-1.5 rounded-lg bg-red-900/30">
            <Trash2 size={14} color="#F87171" />
            <Text className="text-red-400 text-xs ml-1.5">Delete</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}
