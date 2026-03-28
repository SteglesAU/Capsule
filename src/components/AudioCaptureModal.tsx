import { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { Mic, Square, X, Check } from 'lucide-react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { insertItem } from '../db/database';
import { triggerHaptic } from '../lib/haptics';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCaptured: () => void;
}

export function AudioCaptureModal({ visible, onClose, onCaptured }: Props) {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [duration, setDuration] = useState(0);
  const [recorded, setRecorded] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const startRecording = async () => {
    await Audio.requestPermissionsAsync();
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

    const { recording: rec } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );
    setRecording(rec);
    setDuration(0);
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    triggerHaptic('light');
  };

  const stopRecording = async () => {
    if (!recording) return;
    clearInterval(timerRef.current);
    await recording.stopAndUnloadAsync();
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

    const uri = recording.getURI();
    setRecording(null);

    if (uri) {
      const filename = `audio_${Date.now()}.m4a`;
      const destPath = `${FileSystem.documentDirectory}capsule/${filename}`;
      await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}capsule/`, { intermediates: true });
      await FileSystem.moveAsync({ from: uri, to: destPath });
      setRecorded(destPath);
    }
  };

  const saveRecording = async () => {
    if (!recorded) return;
    await insertItem('audio', recorded, {
      durationSeconds: duration,
      mimeType: 'audio/m4a',
    });
    triggerHaptic('success');
    setRecorded(null);
    setDuration(0);
    onCaptured();
    onClose();
  };

  const handleClose = () => {
    if (recording) {
      recording.stopAndUnloadAsync();
      clearInterval(timerRef.current);
      setRecording(null);
    }
    setRecorded(null);
    setDuration(0);
    onClose();
  };

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="flex-1 justify-end">
        <TouchableOpacity className="flex-1" onPress={handleClose} activeOpacity={1} />
        <View className="bg-gray-900 rounded-t-3xl border-t border-gray-700 p-6 items-center">
          <View className="w-full flex-row items-center justify-between mb-8">
            <Text className="text-white text-lg font-semibold">Record Audio</Text>
            <TouchableOpacity onPress={handleClose}>
              <X size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <Text className="text-4xl font-mono text-white mb-8">{formatDuration(duration)}</Text>

          {!recorded ? (
            <TouchableOpacity
              onPress={recording ? stopRecording : startRecording}
              className={`w-20 h-20 rounded-full items-center justify-center ${
                recording ? 'bg-red-600' : 'bg-pink-600'
              }`}
              activeOpacity={0.7}
            >
              {recording ? <Square size={32} color="white" fill="white" /> : <Mic size={32} color="white" />}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={saveRecording}
              className="w-20 h-20 rounded-full bg-green-600 items-center justify-center"
              activeOpacity={0.7}
            >
              <Check size={32} color="white" />
            </TouchableOpacity>
          )}

          <Text className="text-gray-500 text-sm mt-4">
            {recording ? 'Tap to stop' : recorded ? 'Tap to save' : 'Tap to record'}
          </Text>
        </View>
      </View>
    </Modal>
  );
}
