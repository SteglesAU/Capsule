import { useState, useEffect } from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, Platform } from 'react-native';
import { Lock, Unlock, Box, Clock3, Settings as SettingsIcon } from 'lucide-react-native';
import { useLockStore } from '../stores/lockStore';
import { CountdownTimer } from '../components/CountdownTimer';
import { CaptureButtons } from '../components/CaptureButton';
import { TextCaptureModal } from '../components/TextCaptureModal';
import { ImageCaptureSheet } from '../components/ImageCaptureSheet';
import { AudioCaptureModal } from '../components/AudioCaptureModal';
import { getItemCount } from '../db/database';
import { formatTime, wasWindowMissedToday, isSameCalendarDay, resolveClock24, isWithinReviewWindow } from '../lib/timeUtils';
import { useSettingsStore } from '../stores/settingsStore';
import { authenticateWithBiometrics } from '../lib/biometric';

export function LockedScreen({ onSettings }: { onSettings: () => void }) {
  const { unlockHour, unlockMinute, windowDurationMinutes, graceUntilEpoch, lastGraceEpoch, openGraceWindow, bypassUnlock } = useLockStore();
  const use24 = resolveClock24(useSettingsStore(s => s.clockFormat));
  const biometricEnabled = useSettingsStore(s => s.biometricEnabled);
  const windowOpen = isWithinReviewWindow(unlockHour, unlockMinute, windowDurationMinutes) || Date.now() < graceUntilEpoch;

  const tryUnlock = async () => {
    const ok = biometricEnabled ? await authenticateWithBiometrics() : true;
    if (ok) useLockStore.getState().setBiometricVerified(true);
  };
  const [itemCount, setItemCount] = useState(0);
  const [showText, setShowText] = useState(false);
  const [showImage, setShowImage] = useState(false);
  const [showAudio, setShowAudio] = useState(false);
  const missedToday = wasWindowMissedToday(unlockHour, unlockMinute, windowDurationMinutes);
  // Only one grace check per day.
  const graceUsedToday = lastGraceEpoch > 0 && isSameCalendarDay(lastGraceEpoch, Date.now());
  const canGrace = missedToday && !graceUsedToday;

  const refreshCount = async () => {
    const count = await getItemCount();
    setItemCount(count);
  };

  useEffect(() => { refreshCount(); }, []);

  // Re-render periodically so the grace prompt appears if the window expires
  // while this screen stays mounted (missedToday/canGrace are render-time values).
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-black">
      <TouchableOpacity onPress={onSettings} className="absolute top-5 right-5 z-10 p-2" activeOpacity={0.7}>
        <SettingsIcon size={22} color="#6B7280" />
      </TouchableOpacity>
      <View className="flex-1 items-center justify-center px-6">
        {windowOpen ? (
          <>
            {/* Window is open — explicit unlock affordance so it can't be missed */}
            <View className="w-20 h-20 rounded-3xl bg-green-500/10 items-center justify-center mb-6">
              <Unlock size={36} color="#34D399" />
            </View>
            <Text className="text-green-400 text-sm uppercase tracking-widest mb-2">Box is open</Text>
            <Text className="text-gray-500 text-sm mb-8">Your review window is open</Text>
            <TouchableOpacity
              onPress={tryUnlock}
              className="flex-row items-center bg-green-600 px-6 py-3.5 rounded-2xl mb-10"
              activeOpacity={0.8}
            >
              <Unlock size={18} color="white" />
              <Text className="text-white font-semibold text-base ml-2">Open box</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Box icon */}
            <View className="w-20 h-20 rounded-3xl bg-white/5 items-center justify-center mb-6">
              <Lock size={36} color="#6B7280" />
            </View>

            {/* Status */}
            <Text className="text-gray-500 text-sm uppercase tracking-widest mb-2">Box Locked</Text>

            {/* Countdown */}
            <View className="mb-2">
              <CountdownTimer />
            </View>
            <Text className="text-gray-600 text-sm mb-12">
              Opens at {formatTime(unlockHour, unlockMinute, use24)}
            </Text>

            {/* Missed today's window — offer a single 10-minute grace check */}
            {canGrace && (
              <TouchableOpacity
                onPress={() => openGraceWindow(10)}
                className="flex-row items-center bg-blue-600/20 border border-blue-600/40 px-4 py-2.5 rounded-full mb-8"
                activeOpacity={0.7}
              >
                <Clock3 size={15} color="#60A5FA" />
                <Text className="text-blue-400 text-sm ml-2">Missed today — open a 10-min check</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* Item count */}
        {itemCount > 0 && (
          <View className="flex-row items-center bg-white/5 px-4 py-2 rounded-full mb-12">
            <Box size={14} color="#6B7280" />
            <Text className="text-gray-500 text-sm ml-2">
              {itemCount} item{itemCount !== 1 ? 's' : ''} waiting
            </Text>
          </View>
        )}

        {/* Capture buttons */}
        <CaptureButtons
          onText={() => setShowText(true)}
          onImage={() => setShowImage(true)}
          onAudio={() => setShowAudio(true)}
        />

        {/* Demo/dev convenience — skip the wait while iterating. Excluded from native
            production builds (web preview + __DEV__ only) so it can never ship. */}
        {(Platform.OS === 'web' || __DEV__) && (
        <TouchableOpacity onPress={bypassUnlock} className="mt-10 px-4 py-2 rounded-full border border-gray-700" activeOpacity={0.7}>
          <Text className="text-gray-500 text-xs">⚡ Test bypass — open now</Text>
        </TouchableOpacity>
        )}
      </View>

      <TextCaptureModal visible={showText} onClose={() => setShowText(false)} onCaptured={refreshCount} />
      <ImageCaptureSheet visible={showImage} onClose={() => setShowImage(false)} onCaptured={refreshCount} />
      <AudioCaptureModal visible={showAudio} onClose={() => setShowAudio(false)} onCaptured={refreshCount} />
    </SafeAreaView>
  );
}
