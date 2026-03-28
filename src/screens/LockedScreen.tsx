import { useState, useEffect } from 'react';
import { View, Text, SafeAreaView } from 'react-native';
import { Lock, Box } from 'lucide-react-native';
import { useLockStore } from '../stores/lockStore';
import { CountdownTimer } from '../components/CountdownTimer';
import { CaptureButtons } from '../components/CaptureButton';
import { TextCaptureModal } from '../components/TextCaptureModal';
import { ImageCaptureSheet } from '../components/ImageCaptureSheet';
import { AudioCaptureModal } from '../components/AudioCaptureModal';
import { getItemCount } from '../db/database';
import { formatTime } from '../lib/timeUtils';

export function LockedScreen() {
  const { unlockHour, unlockMinute } = useLockStore();
  const [itemCount, setItemCount] = useState(0);
  const [showText, setShowText] = useState(false);
  const [showImage, setShowImage] = useState(false);
  const [showAudio, setShowAudio] = useState(false);

  const refreshCount = async () => {
    const count = await getItemCount();
    setItemCount(count);
  };

  useEffect(() => { refreshCount(); }, []);

  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-1 items-center justify-center px-6">
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
          Opens at {formatTime(unlockHour, unlockMinute)}
        </Text>

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
      </View>

      <TextCaptureModal visible={showText} onClose={() => setShowText(false)} onCaptured={refreshCount} />
      <ImageCaptureSheet visible={showImage} onClose={() => setShowImage(false)} onCaptured={refreshCount} />
      <AudioCaptureModal visible={showAudio} onClose={() => setShowAudio(false)} onCaptured={refreshCount} />
    </SafeAreaView>
  );
}
