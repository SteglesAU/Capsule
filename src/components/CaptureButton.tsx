import { View, TouchableOpacity, Text } from 'react-native';
import { Type, Camera, Mic } from 'lucide-react-native';

interface Props {
  onText: () => void;
  onImage: () => void;
  onAudio: () => void;
}

export function CaptureButtons({ onText, onImage, onAudio }: Props) {
  const buttons = [
    { icon: Type, label: 'Text', onPress: onText, color: '#60A5FA' },
    { icon: Camera, label: 'Image', onPress: onImage, color: '#34D399' },
    { icon: Mic, label: 'Audio', onPress: onAudio, color: '#F472B6' },
  ];

  return (
    <View className="flex-row justify-center gap-6">
      {buttons.map(({ icon: Icon, label, onPress, color }) => (
        <TouchableOpacity
          key={label}
          onPress={onPress}
          className="items-center"
          activeOpacity={0.7}
        >
          <View className="w-16 h-16 rounded-2xl bg-white/10 items-center justify-center mb-2">
            <Icon size={28} color={color} />
          </View>
          <Text className="text-gray-400 text-xs">{label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
