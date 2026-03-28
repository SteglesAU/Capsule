import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { ChevronLeft, Clock, Timer, Bell, Trash2, Vibrate, Fingerprint } from 'lucide-react-native';
import { useLockStore } from '../stores/lockStore';
import { useSettingsStore } from '../stores/settingsStore';
import { persistLockState, persistSettings } from '../lib/persistence';
import { scheduleUnlockNotification } from '../lib/notifications';
import { formatTime } from '../lib/timeUtils';
import { getStorageStats } from '../db/database';
import { useState, useEffect } from 'react';

interface Props {
  onBack: () => void;
}

export function SettingsScreen({ onBack }: Props) {
  const lock = useLockStore();
  const settings = useSettingsStore();
  const [stats, setStats] = useState({ text: 0, image: 0, audio: 0, file: 0, total: 0 });

  useEffect(() => { getStorageStats().then(setStats); }, []);

  const updateUnlockTime = async (hour: number) => {
    lock.setUnlockTime(hour, 0);
    await persistLockState();
    await scheduleUnlockNotification();
  };

  const updateWindowDuration = async (minutes: number) => {
    lock.setWindowDuration(minutes);
    await persistLockState();
  };

  const toggleSetting = async (key: string, value: boolean) => {
    switch (key) {
      case 'notifyOnUnlock': settings.setNotifyOnUnlock(value); break;
      case 'notifyReminder': settings.setNotifyReminder(value); break;
      case 'autoDeleteAfterReview': settings.setAutoDeleteAfterReview(value); break;
      case 'hapticsEnabled': settings.setHapticsEnabled(value); break;
      case 'biometricEnabled': settings.setBiometricEnabled(value); break;
    }
    await persistSettings();
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-row items-center px-6 pt-4 pb-3 border-b border-gray-800">
        <TouchableOpacity onPress={onBack} className="mr-3">
          <ChevronLeft size={24} color="#9CA3AF" />
        </TouchableOpacity>
        <Text className="text-white text-xl font-bold">Settings</Text>
      </View>

      <ScrollView className="flex-1 px-6 py-4">
        {/* Schedule */}
        <Text className="text-gray-500 text-xs uppercase tracking-wider mb-3">Schedule</Text>

        <View className="bg-gray-800/50 rounded-xl p-4 mb-2">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <Clock size={18} color="#60A5FA" />
              <Text className="text-white text-base">Unlock Time</Text>
            </View>
            <Text className="text-blue-400 text-base">{formatTime(lock.unlockHour, lock.unlockMinute)}</Text>
          </View>
        </View>

        <View className="bg-gray-800/50 rounded-xl p-4 mb-6">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <Timer size={18} color="#60A5FA" />
              <Text className="text-white text-base">Review Window</Text>
            </View>
            <Text className="text-blue-400 text-base">{lock.windowDurationMinutes} min</Text>
          </View>
        </View>

        {/* Notifications */}
        <Text className="text-gray-500 text-xs uppercase tracking-wider mb-3">Notifications</Text>

        <View className="bg-gray-800/50 rounded-xl mb-6">
          <View className="flex-row items-center justify-between p-4 border-b border-gray-700">
            <View className="flex-row items-center gap-3">
              <Bell size={18} color="#34D399" />
              <Text className="text-white text-base">Unlock Alert</Text>
            </View>
            <Switch
              value={settings.notifyOnUnlock}
              onValueChange={v => toggleSetting('notifyOnUnlock', v)}
              trackColor={{ false: '#374151', true: '#2563EB' }}
            />
          </View>
          <View className="flex-row items-center justify-between p-4">
            <View className="flex-row items-center gap-3">
              <Bell size={18} color="#34D399" />
              <Text className="text-white text-base">Daily Reminder</Text>
            </View>
            <Switch
              value={settings.notifyReminder}
              onValueChange={v => toggleSetting('notifyReminder', v)}
              trackColor={{ false: '#374151', true: '#2563EB' }}
            />
          </View>
        </View>

        {/* Behavior */}
        <Text className="text-gray-500 text-xs uppercase tracking-wider mb-3">Behavior</Text>

        <View className="bg-gray-800/50 rounded-xl mb-6">
          <View className="flex-row items-center justify-between p-4 border-b border-gray-700">
            <View className="flex-row items-center gap-3">
              <Fingerprint size={18} color="#A78BFA" />
              <Text className="text-white text-base">Biometric Lock</Text>
            </View>
            <Switch
              value={settings.biometricEnabled}
              onValueChange={v => toggleSetting('biometricEnabled', v)}
              trackColor={{ false: '#374151', true: '#2563EB' }}
            />
          </View>
          <View className="flex-row items-center justify-between p-4 border-b border-gray-700">
            <View className="flex-row items-center gap-3">
              <Vibrate size={18} color="#A78BFA" />
              <Text className="text-white text-base">Haptics</Text>
            </View>
            <Switch
              value={settings.hapticsEnabled}
              onValueChange={v => toggleSetting('hapticsEnabled', v)}
              trackColor={{ false: '#374151', true: '#2563EB' }}
            />
          </View>
          <View className="flex-row items-center justify-between p-4">
            <View className="flex-row items-center gap-3">
              <Trash2 size={18} color="#F87171" />
              <Text className="text-white text-base">Auto-delete after review</Text>
            </View>
            <Switch
              value={settings.autoDeleteAfterReview}
              onValueChange={v => toggleSetting('autoDeleteAfterReview', v)}
              trackColor={{ false: '#374151', true: '#2563EB' }}
            />
          </View>
        </View>

        {/* Storage */}
        <Text className="text-gray-500 text-xs uppercase tracking-wider mb-3">Storage</Text>
        <View className="bg-gray-800/50 rounded-xl p-4 mb-6">
          <Text className="text-white text-base mb-2">{stats.total} items stored</Text>
          <Text className="text-gray-500 text-sm">Text: {stats.text} | Images: {stats.image} | Audio: {stats.audio}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
