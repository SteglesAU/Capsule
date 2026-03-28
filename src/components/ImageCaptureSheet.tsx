import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { Camera, Image as ImageIcon, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { insertItem } from '../db/database';
import { triggerHaptic } from '../lib/haptics';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCaptured: () => void;
}

export function ImageCaptureSheet({ visible, onClose, onCaptured }: Props) {
  const captureImage = async (useCamera: boolean) => {
    const fn = useCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const result = await fn({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];

    // Copy to app directory
    const filename = `img_${Date.now()}.jpg`;
    const destPath = `${FileSystem.documentDirectory}capsule/${filename}`;
    await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}capsule/`, { intermediates: true });
    await FileSystem.copyAsync({ from: asset.uri, to: destPath });

    await insertItem('image', destPath, {
      width: asset.width,
      height: asset.height,
      mimeType: asset.mimeType || 'image/jpeg',
      filename,
    });

    triggerHaptic('success');
    onCaptured();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="flex-1 justify-end">
        <TouchableOpacity className="flex-1" onPress={onClose} activeOpacity={1} />
        <View className="bg-gray-900 rounded-t-3xl border-t border-gray-700 p-6">
          <View className="flex-row items-center justify-between mb-6">
            <Text className="text-white text-lg font-semibold">Capture Image</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => captureImage(true)}
            className="flex-row items-center p-4 bg-gray-800 rounded-xl mb-3"
            activeOpacity={0.7}
          >
            <Camera size={24} color="#34D399" />
            <Text className="text-white ml-3 text-base">Take Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => captureImage(false)}
            className="flex-row items-center p-4 bg-gray-800 rounded-xl"
            activeOpacity={0.7}
          >
            <ImageIcon size={24} color="#60A5FA" />
            <Text className="text-white ml-3 text-base">Choose from Library</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
