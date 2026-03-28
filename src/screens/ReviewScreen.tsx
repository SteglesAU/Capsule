import { useState, useEffect, useCallback } from 'react';
import { View, Text, SafeAreaView, FlatList, TouchableOpacity, Alert } from 'react-native';
import { Lock, Unlock, Trash2 } from 'lucide-react-native';
import { useLockStore } from '../stores/lockStore';
import { useSettingsStore } from '../stores/settingsStore';
import { getUnreviewedItems, deleteItem, archiveItem, deleteItems, markReviewed, CapsuleItem } from '../db/database';
import { ReviewItem } from '../components/ReviewItem';
import { triggerHaptic } from '../lib/haptics';
import { persistLockState } from '../lib/persistence';
import { formatTime, getWindowEndDate, formatCountdown } from '../lib/timeUtils';
import * as Sharing from 'expo-sharing';

export function ReviewScreen() {
  const { unlockHour, unlockMinute, windowDurationMinutes, lock } = useLockStore();
  const { autoDeleteAfterReview } = useSettingsStore();
  const [items, setItems] = useState<CapsuleItem[]>([]);
  const [windowRemaining, setWindowRemaining] = useState('');

  const loadItems = useCallback(async () => {
    const data = await getUnreviewedItems();
    setItems(data);
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  // Window countdown
  useEffect(() => {
    const update = () => {
      const end = getWindowEndDate(unlockHour, unlockMinute, windowDurationMinutes);
      const remaining = end.getTime() - Date.now();
      if (remaining <= 0) {
        handleLock();
        return;
      }
      setWindowRemaining(formatCountdown(end.getTime()));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [unlockHour, unlockMinute, windowDurationMinutes]);

  const handleLock = async () => {
    if (autoDeleteAfterReview && items.length > 0) {
      const ids = items.map(i => i.id);
      await markReviewed(ids);
    }
    lock();
    await persistLockState();
  };

  const handleDelete = async (id: string) => {
    Alert.alert('Delete', 'This item will be permanently deleted.', [
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
      await Sharing.shareAsync(item.content);
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
            <Text className="text-white text-xl font-bold">Review Mode</Text>
          </View>
          <TouchableOpacity onPress={handleLock} className="flex-row items-center gap-2 px-3 py-2 bg-gray-800 rounded-lg">
            <Lock size={14} color="#9CA3AF" />
            <Text className="text-gray-400 text-sm">Lock</Text>
          </TouchableOpacity>
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
            data={items}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <ReviewItem
                item={item}
                onDelete={handleDelete}
                onArchive={handleArchive}
                onExport={handleExport}
              />
            )}
            contentContainerStyle={{ padding: 16 }}
          />

          {/* Batch actions */}
          <View className="px-6 py-4 border-t border-gray-800">
            <TouchableOpacity onPress={handleDeleteAll} className="flex-row items-center justify-center py-3 bg-red-900/20 rounded-xl">
              <Trash2 size={16} color="#F87171" />
              <Text className="text-red-400 font-medium ml-2">Delete All</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
