import { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { X, Send } from 'lucide-react-native';
import { insertItem } from '../db/database';
import { triggerHaptic } from '../lib/haptics';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCaptured: () => void;
}

export function TextCaptureModal({ visible, onClose, onCaptured }: Props) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) setTimeout(() => inputRef.current?.focus(), 200);
  }, [visible]);

  const handleSave = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      await insertItem('text', text.trim(), { charCount: text.trim().length });
      triggerHaptic('success');
      setText('');
      onCaptured();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 justify-end"
      >
        <View className="bg-gray-900 rounded-t-3xl border-t border-gray-700 p-6 min-h-[300px]">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-white text-lg font-semibold">Quick Note</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            placeholder="What's on your mind?"
            placeholderTextColor="#6B7280"
            multiline
            className="flex-1 text-white text-base leading-6 mb-4"
            textAlignVertical="top"
          />

          <TouchableOpacity
            onPress={handleSave}
            disabled={!text.trim() || saving}
            className={`flex-row items-center justify-center py-3 rounded-xl ${
              text.trim() ? 'bg-blue-600' : 'bg-gray-700'
            }`}
            activeOpacity={0.8}
          >
            <Send size={18} color="white" />
            <Text className="text-white font-semibold ml-2">
              {saving ? 'Saving...' : 'Drop in Box'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
