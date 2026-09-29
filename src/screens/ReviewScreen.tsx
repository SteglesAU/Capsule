import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, SafeAreaView, FlatList, TouchableOpacity, Alert } from 'react-native';
import { Lock, Unlock, Trash2, Layers, Combine } from 'lucide-react-native';
import { useLockStore } from '../stores/lockStore';
import { useSettingsStore } from '../stores/settingsStore';
import { getUnreviewedItems, deleteItem, archiveItem, deleteItems, markReviewed, groupItems, CapsuleItem } from '../db/database';
import { itemLeafCount } from '../lib/bundleTree';
import { ReviewItem } from '../components/ReviewItem';
import { ItemDetail } from '../components/ItemDetail';
import { triggerHaptic } from '../lib/haptics';
import { persistLockState } from '../lib/persistence';
import { formatTime, getWindowEndDate, formatCountdown } from '../lib/timeUtils';
import { decryptFileToTemp, isEncrypted, clearDecryptedCache } from '../lib/crypto';
import * as Sharing from 'expo-sharing';

export function ReviewScreen() {
  const { unlockHour, unlockMinute, windowDurationMinutes, graceUntilEpoch, lock } = useLockStore();
  const { autoDeleteAfterReview } = useSettingsStore();
  const premium = useSettingsStore(s => s.premium);
  const [items, setItems] = useState<CapsuleItem[]>([]);
  const [windowRemaining, setWindowRemaining] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailItem, setDetailItem] = useState<CapsuleItem | null>(null);

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };
  const runGroup = async (mode: 'group' | 'combine') => {
    if (selected.size < 2) return;
    await groupItems([...selected], mode);
    triggerHaptic('success');
    exitSelect();
    loadItems();
  };

  // The 1s countdown effect calls handleLock() from a closure captured at mount, so
  // reading `items` directly there would see the empty mount-time value. Mirror the
  // latest items into a ref so auto-lock marks everything actually present as reviewed.
  const itemsRef = useRef<CapsuleItem[]>([]);
  itemsRef.current = items;

  const loadItems = useCallback(async () => {
    const data = await getUnreviewedItems();
    setItems(data);
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  // Window countdown
  useEffect(() => {
    const update = () => {
      const normalEnd = getWindowEndDate(unlockHour, unlockMinute, windowDurationMinutes).getTime();
      // During a grace check the normal window is in the past — honor the grace end.
      const end = Math.max(normalEnd, graceUntilEpoch);
      const remaining = end - Date.now();
      if (remaining <= 0) {
        handleLock();
        return;
      }
      setWindowRemaining(formatCountdown(end));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [unlockHour, unlockMinute, windowDurationMinutes, graceUntilEpoch]);

  const handleLock = async () => {
    const current = itemsRef.current; // latest, not the mount-time snapshot
    if (autoDeleteAfterReview && current.length > 0) {
      const ids = current.map(i => i.id);
      await markReviewed(ids);
    }
    lock();
    await persistLockState();
    // Wipe any files that were decrypted to cache for preview/export this session.
    await clearDecryptedCache();
  };

  const handleDelete = async (id: string) => {
    // A group delete removes everything nested inside it — say so, with the count,
    // so it can't silently take a whole group's worth of items.
    const target = items.find(i => i.id === id);
    const isGroup = target?.type === 'bundle';
    const n = target ? itemLeafCount(target) : 1;
    const msg = isGroup
      ? `This group and all ${n} item${n !== 1 ? 's' : ''} inside it will be permanently deleted.`
      : 'This item will be permanently deleted.';
    Alert.alert(isGroup ? 'Delete group' : 'Delete', msg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await deleteItem(id);
          triggerHaptic('light');
          loadItems();
        }
      },
    ]);
  };

  const handleArchive = async (id: string) => {
    await archiveItem(id);
    triggerHaptic('light');
    loadItems();
  };

  const handleExport = async (item: CapsuleItem) => {
    if (item.type === 'text') {
      const available = await Sharing.isAvailableAsync();
      if (!available) { Alert.alert('Sharing not available'); return; }
      // For text, create a temp file
      const FileSystem = require('expo-file-system');
      const path = `${FileSystem.cacheDirectory}capsule_export.txt`;
      await FileSystem.writeAsStringAsync(path, item.content);
      await Sharing.shareAsync(path, { mimeType: 'text/plain' });
    } else if (item.content) {
      // Decrypt media to a temp file before sharing (ciphertext on disk otherwise).
      const path = isEncrypted(item.content) ? await decryptFileToTemp(item.content) : item.content;
      await Sharing.shareAsync(path);
    }
  };

  const handleDeleteAll = () => {
    if (items.length === 0) return;
    Alert.alert('Delete All', `Delete all ${items.length} items? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete All', style: 'destructive',
        onPress: async () => {
          await deleteItems(items.map(i => i.id));
          triggerHaptic('medium');
          loadItems();
        }
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      {/* Header */}
      <View className="px-6 pt-4 pb-3 border-b border-gray-800">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <Unlock size={20} color="#34D399" />
            <Text className="text-white text-xl font-bold">{selectMode ? `${selected.size} selected` : 'Review Mode'}</Text>
          </View>
          <View className="flex-row items-center gap-2">
            {selectMode ? (
              <TouchableOpacity onPress={exitSelect} className="px-3 py-2 bg-gray-800 rounded-lg">
                <Text className="text-gray-400 text-sm">Cancel</Text>
              </TouchableOpacity>
            ) : (
              <>
                {premium && items.length >= 2 && (
                  <TouchableOpacity onPress={() => setSelectMode(true)} className="flex-row items-center gap-1.5 px-3 py-2 bg-gray-800 rounded-lg">
                    <Layers size={14} color="#A78BFA" />
                    <Text className="text-gray-300 text-sm">Select</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={handleLock} className="flex-row items-center gap-2 px-3 py-2 bg-gray-800 rounded-lg">
                  <Lock size={14} color="#9CA3AF" />
                  <Text className="text-gray-400 text-sm">Lock</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
        <View className="flex-row items-center justify-between mt-2">
          <Text className="text-gray-500 text-sm">{items.length} item{items.length !== 1 ? 's' : ''} to review</Text>
          <Text className="text-gray-600 text-xs">{windowRemaining} remaining</Text>
        </View>
      </View>

      {/* Items */}
      {items.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-600 text-base">Nothing to review</Text>
          <Text className="text-gray-700 text-sm mt-1">Your box is empty</Text>
        </View>
      ) : (
        <>
          <FlatList
            className="flex-1"
            data={items}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <ReviewItem
                item={item}
                onDelete={handleDelete}
                onArchive={handleArchive}
                onExport={handleExport}
                onOpenDetail={setDetailItem}
                selectMode={selectMode}
                selected={selected.has(item.id)}
                onToggleSelect={toggleSelect}
              />
            )}
            contentContainerStyle={{ padding: 16 }}
          />

          {/* Batch actions */}
          <View className="px-6 py-4 border-t border-gray-800">
            {selectMode ? (
              <View>
                <Text className="text-gray-500 text-xs text-center mb-2">
                  {selected.size >= 2 ? `${selected.size} selected — choose how to combine` : 'Select 2 or more'}
                </Text>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => runGroup('group')}
                    disabled={selected.size < 2}
                    className={`flex-1 items-center py-3 rounded-xl ${selected.size >= 2 ? 'bg-purple-600/30' : 'bg-gray-800/40'}`}
                    activeOpacity={0.8}
                  >
                    <Layers size={18} color={selected.size >= 2 ? '#A78BFA' : '#6B7280'} />
                    <Text className={`font-semibold mt-1 ${selected.size >= 2 ? 'text-purple-200' : 'text-gray-500'}`}>Group</Text>
                    <Text className={`text-[10px] mt-0.5 ${selected.size >= 2 ? 'text-purple-300/70' : 'text-gray-600'}`}>Nest as sub-groups</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => runGroup('combine')}
                    disabled={selected.size < 2}
                    className={`flex-1 items-center py-3 rounded-xl ${selected.size >= 2 ? 'bg-blue-600/25' : 'bg-gray-800/40'}`}
                    activeOpacity={0.8}
                  >
                    <Combine size={18} color={selected.size >= 2 ? '#60A5FA' : '#6B7280'} />
                    <Text className={`font-semibold mt-1 ${selected.size >= 2 ? 'text-blue-200' : 'text-gray-500'}`}>Combine</Text>
                    <Text className={`text-[10px] mt-0.5 ${selected.size >= 2 ? 'text-blue-300/70' : 'text-gray-600'}`}>Merge into one timeline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity onPress={handleDeleteAll} className="flex-row items-center justify-center py-3 bg-red-900/20 rounded-xl">
                <Trash2 size={16} color="#F87171" />
                <Text className="text-red-400 font-medium ml-2">Delete All</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}

      {detailItem && (
        <ItemDetail item={detailItem} onClose={() => setDetailItem(null)} onChanged={loadItems} />
      )}
    </SafeAreaView>
  );
}
