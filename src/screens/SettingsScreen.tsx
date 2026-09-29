import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, Switch, Modal, Alert } from 'react-native';
import { ChevronLeft, Clock, Timer, Bell, Trash2, Vibrate, Fingerprint, ChevronRight, Check, X, CalendarPlus, CalendarCheck } from 'lucide-react-native';
import { useLockStore } from '../stores/lockStore';
import { useSettingsStore, ClockFormat } from '../stores/settingsStore';
import { persistLockState, persistSettings } from '../lib/persistence';
import { scheduleUnlockNotification } from '../lib/notifications';
import { isCalendarLinked, addUnlockToCalendar, updateUnlockCalendar, removeUnlockFromCalendar } from '../lib/calendar';
import { formatTime, resolveClock24 } from '../lib/timeUtils';
import { getStorageStats } from '../db/database';
import { TimeRoller } from '../components/TimeRoller';
import { useState, useEffect } from 'react';

interface Props {
  onBack: () => void;
}

const DURATIONS = [
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
  { label: '4 hours', value: 240 },
];

export function SettingsScreen({ onBack }: Props) {
  const lock = useLockStore();
  const settings = useSettingsStore();
  const use24 = resolveClock24(settings.clockFormat);
  const [stats, setStats] = useState({ text: 0, image: 0, audio: 0, file: 0, total: 0 });
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [calendarLinked, setCalendarLinked] = useState(false);
  const [calBusy, setCalBusy] = useState(false);
  const [calChecked, setCalChecked] = useState(false); // initial link-state resolved?

  useEffect(() => { getStorageStats().then(setStats); }, []);
  // Disable the calendar action until we know the current link state, so a tap
  // during the async check can't add a duplicate block to an already-linked calendar.
  useEffect(() => { isCalendarLinked().then(v => { setCalendarLinked(v); setCalChecked(true); }); }, []);

  // Roller updates the time live (cheap); persistence + reschedule happen on close.
  const changeTime = (hour: number, minute: number) => lock.setUnlockTime(hour, minute);

  const closeTimePicker = async () => {
    setShowTimePicker(false);
    await persistLockState();
    await scheduleUnlockNotification();
    if (calendarLinked) await updateUnlockCalendar(lock.unlockHour, lock.unlockMinute, lock.windowDurationMinutes).catch(() => {});
  };

  const changeClockFormat = async (fmt: ClockFormat) => {
    settings.setClockFormat(fmt);
    await persistSettings();
  };

  const updateWindowDuration = async (minutes: number) => {
    lock.setWindowDuration(minutes);
    await persistLockState();
    await scheduleUnlockNotification();
    if (calendarLinked) await updateUnlockCalendar(lock.unlockHour, lock.unlockMinute, minutes).catch(() => {});
    setShowDurationPicker(false);
  };

  const toggleCalendar = async () => {
    if (calBusy || !calChecked) return; // block re-entrancy AND taps before link-state resolves
    setCalBusy(true);
    try {
      if (calendarLinked) {
        await removeUnlockFromCalendar();
        setCalendarLinked(false);
      } else {
        const ok = await addUnlockToCalendar(lock.unlockHour, lock.unlockMinute, lock.windowDurationMinutes);
        if (ok) setCalendarLinked(true);
        else Alert.alert('Calendar access needed', 'Allow calendar access to block out your review window.');
      }
    } finally {
      setCalBusy(false);
    }
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

        <TouchableOpacity className="bg-gray-800/50 rounded-xl p-4 mb-2" activeOpacity={0.7} onPress={() => setShowTimePicker(true)}>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <Clock size={18} color="#60A5FA" />
              <Text className="text-white text-base">Unlock Time</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Text className="text-blue-400 text-base">{formatTime(lock.unlockHour, lock.unlockMinute, use24)}</Text>
              <ChevronRight size={18} color="#4B5563" />
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity className="bg-gray-800/50 rounded-xl p-4 mb-6" activeOpacity={0.7} onPress={() => setShowDurationPicker(true)}>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <Timer size={18} color="#60A5FA" />
              <Text className="text-white text-base">Review Window</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Text className="text-blue-400 text-base">{lock.windowDurationMinutes} min</Text>
              <ChevronRight size={18} color="#4B5563" />
            </View>
          </View>
        </TouchableOpacity>

        {/* Time format */}
        <View className="bg-gray-800/50 rounded-xl p-4 mb-6">
          <View className="flex-row items-center gap-3 mb-3">
            <Clock size={18} color="#60A5FA" />
            <Text className="text-white text-base">Time format</Text>
          </View>
          <View className="flex-row gap-2">
            {(['system', '12', '24'] as ClockFormat[]).map(opt => (
              <TouchableOpacity
                key={opt}
                onPress={() => changeClockFormat(opt)}
                className={`flex-1 py-2 rounded-lg items-center ${settings.clockFormat === opt ? 'bg-blue-600/20 border border-blue-600/50' : 'bg-gray-900/50 border border-transparent'}`}
              >
                <Text className={`text-sm ${settings.clockFormat === opt ? 'text-blue-400 font-semibold' : 'text-gray-400'}`}>
                  {opt === 'system' ? 'System' : opt === '12' ? '12-hour' : '24-hour'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Add / remove the recurring calendar block */}
        <TouchableOpacity
          className="flex-row items-center justify-center gap-2 bg-gray-800/50 rounded-xl p-4 mb-6"
          activeOpacity={0.7}
          disabled={calBusy || !calChecked}
          onPress={toggleCalendar}
        >
          {calendarLinked ? <CalendarCheck size={18} color="#34D399" /> : <CalendarPlus size={18} color="#60A5FA" />}
          <Text className={`text-base ${calendarLinked ? 'text-green-400' : 'text-blue-400'}`}>
            {calendarLinked ? 'Added to Calendar — tap to remove' : 'Add to Calendar'}
          </Text>
        </TouchableOpacity>

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

      {/* Unlock time picker */}
      <Modal visible={showTimePicker} animationType="slide" transparent onRequestClose={closeTimePicker}>
        <View className="flex-1 justify-end">
          <TouchableOpacity className="flex-1" onPress={closeTimePicker} activeOpacity={1} />
          <View className="bg-gray-900 rounded-t-3xl border-t border-gray-700 p-6">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-white text-lg font-semibold">Unlock Time</Text>
              <TouchableOpacity onPress={closeTimePicker}><X size={24} color="#9CA3AF" /></TouchableOpacity>
            </View>
            <TimeRoller hour24={lock.unlockHour} minute={lock.unlockMinute} onChange={changeTime} />
            <TouchableOpacity onPress={closeTimePicker} className="mt-4 py-3 bg-blue-600 rounded-2xl items-center" activeOpacity={0.8}>
              <Text className="text-white font-semibold text-base">Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Review window picker */}
      <Modal visible={showDurationPicker} animationType="slide" transparent>
        <View className="flex-1 justify-end">
          <TouchableOpacity className="flex-1" onPress={() => setShowDurationPicker(false)} activeOpacity={1} />
          <View className="bg-gray-900 rounded-t-3xl border-t border-gray-700 p-6">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-white text-lg font-semibold">Review Window</Text>
              <TouchableOpacity onPress={() => setShowDurationPicker(false)}><X size={24} color="#9CA3AF" /></TouchableOpacity>
            </View>
            {DURATIONS.map(d => (
              <TouchableOpacity
                key={d.value}
                onPress={() => updateWindowDuration(d.value)}
                className={`flex-row items-center justify-between py-4 px-5 rounded-xl mb-3 ${
                  lock.windowDurationMinutes === d.value ? 'bg-blue-600/20 border border-blue-600/50' : 'bg-gray-800/50'
                }`}
              >
                <Text className={`text-lg ${lock.windowDurationMinutes === d.value ? 'text-blue-400 font-semibold' : 'text-gray-300'}`}>{d.label}</Text>
                {lock.windowDurationMinutes === d.value && <Check size={18} color="#60A5FA" />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
