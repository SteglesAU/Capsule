import { View, Text, TouchableOpacity, Image } from 'react-native';
import { Trash2, Archive, Share2, Type, Camera, Mic, File } from 'lucide-react-native';
import { CapsuleItem } from '../db/database';

interface Props {
  item: CapsuleItem;
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
  onExport: (item: CapsuleItem) => void;
}

const TYPE_ICONS = {
  text: { icon: Type, color: '#60A5FA' },
  image: { icon: Camera, color: '#34D399' },
  audio: { icon: Mic, color: '#F472B6' },
  file: { icon: File, color: '#FBBF24' },
};

export function ReviewItem({ item, onDelete, onArchive, onExport }: Props) {
  const typeInfo = TYPE_ICONS[item.type];
  const Icon = typeInfo.icon;
  const meta = JSON.parse(item.metadata_json || '{}');
  const date = new Date(item.timestamp_created);

  return (
    <View className="bg-gray-800 rounded-xl p-4 mb-3">
      <View className="flex-row items-start gap-3">
        <View className="w-10 h-10 rounded-lg bg-white/5 items-center justify-center mt-0.5">
          <Icon size={20} color={typeInfo.color} />
        </View>

        <View className="flex-1">
          {item.type === 'text' && (
            <Text className="text-white text-base leading-6" numberOfLines={6}>{item.content}</Text>
          )}
          {item.type === 'image' && (
            <Image source={{ uri: item.content }} className="w-full h-48 rounded-lg" resizeMode="cover" />
          )}
          {item.type === 'audio' && (
            <Text className="text-white text-base">
              Audio note — {meta.durationSeconds ? `${Math.floor(meta.durationSeconds / 60)}:${(meta.durationSeconds % 60).toString().padStart(2, '0')}` : 'Unknown duration'}
            </Text>
          )}

          <Text className="text-gray-500 text-xs mt-2">
            {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            {' at '}
            {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </Text>
        </View>
      </View>

      <View className="flex-row justify-end gap-2 mt-3 pt-3 border-t border-gray-700">
        <TouchableOpacity onPress={() => onExport(item)} className="flex-row items-center px-3 py-1.5 rounded-lg bg-gray-700">
          <Share2 size={14} color="#9CA3AF" />
          <Text className="text-gray-400 text-xs ml-1.5">Export</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onArchive(item.id)} className="flex-row items-center px-3 py-1.5 rounded-lg bg-gray-700">
          <Archive size={14} color="#9CA3AF" />
          <Text className="text-gray-400 text-xs ml-1.5">Archive</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onDelete(item.id)} className="flex-row items-center px-3 py-1.5 rounded-lg bg-red-900/30">
          <Trash2 size={14} color="#F87171" />
          <Text className="text-red-400 text-xs ml-1.5">Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
