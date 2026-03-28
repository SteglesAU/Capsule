import { useState } from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, ScrollView } from 'react-native';
import { Box, Lock, Clock, ChevronRight, Check } from 'lucide-react-native';
import { useLockStore } from '../stores/lockStore';
import { persistLockState, persistSettings } from '../lib/persistence';
import { requestNotificationPermissions, scheduleUnlockNotification } from '../lib/notifications';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DURATIONS = [
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
  { label: '4 hours', value: 240 },
];

export function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const { setUnlockTime, setWindowDuration, setOnboardingComplete } = useLockStore();
  const [selectedHour, setSelectedHour] = useState(20);
  const [selectedDuration, setSelectedDuration] = useState(120);

  const handleComplete = async () => {
    setUnlockTime(selectedHour, 0);
    setWindowDuration(selectedDuration);
    setOnboardingComplete(true);
    await persistLockState();
    await persistSettings();

    const granted = await requestNotificationPermissions();
    if (granted) await scheduleUnlockNotification();
  };

  const formatHour = (h: number) => {
    const period = h >= 12 ? 'PM' : 'AM';
    const display = h % 12 || 12;
    return `${display}:00 ${period}`;
  };

  const steps = [
    // Step 0: Welcome
    <View key="welcome" className="flex-1 items-center justify-center px-8">
      <View className="w-24 h-24 rounded-3xl bg-white/5 items-center justify-center mb-8">
        <Box size={48} color="#60A5FA" />
      </View>
      <Text className="text-white text-3xl font-bold text-center mb-4">Capsule</Text>
      <Text className="text-gray-400 text-center text-base leading-7 mb-2">
        Capture ideas anytime. Review them later.
      </Text>
      <Text className="text-gray-500 text-center text-sm leading-6">
        Drop thoughts, images, and audio into your box throughout the day. They're locked away until your daily review window opens.
      </Text>
    </View>,

    // Step 1: Set unlock time
    <View key="time" className="flex-1 px-8 pt-12">
      <View className="items-center mb-8">
        <Clock size={32} color="#60A5FA" />
        <Text className="text-white text-2xl font-bold mt-4 mb-2">When should your box open?</Text>
        <Text className="text-gray-500 text-center text-sm">Pick a time when you want to review your captured ideas.</Text>
      </View>

      <ScrollView className="max-h-72" showsVerticalScrollIndicator={false}>
        {HOURS.map(h => (
          <TouchableOpacity
            key={h}
            onPress={() => setSelectedHour(h)}
            className={`flex-row items-center justify-between py-3 px-4 rounded-xl mb-1 ${
              selectedHour === h ? 'bg-blue-600/20 border border-blue-600/50' : 'bg-gray-800/50'
            }`}
          >
            <Text className={`text-base ${selectedHour === h ? 'text-blue-400 font-semibold' : 'text-gray-300'}`}>
              {formatHour(h)}
            </Text>
            {selectedHour === h && <Check size={18} color="#60A5FA" />}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>,

    // Step 2: Set window duration
    <View key="duration" className="flex-1 px-8 pt-12">
      <View className="items-center mb-8">
        <Lock size={32} color="#60A5FA" />
        <Text className="text-white text-2xl font-bold mt-4 mb-2">How long should it stay open?</Text>
        <Text className="text-gray-500 text-center text-sm">If you don't review in time, the box locks until tomorrow.</Text>
      </View>

      {DURATIONS.map(d => (
        <TouchableOpacity
          key={d.value}
          onPress={() => setSelectedDuration(d.value)}
          className={`flex-row items-center justify-between py-4 px-5 rounded-xl mb-3 ${
            selectedDuration === d.value ? 'bg-blue-600/20 border border-blue-600/50' : 'bg-gray-800/50'
          }`}
        >
          <Text className={`text-lg ${selectedDuration === d.value ? 'text-blue-400 font-semibold' : 'text-gray-300'}`}>
            {d.label}
          </Text>
          {selectedDuration === d.value && <Check size={18} color="#60A5FA" />}
        </TouchableOpacity>
      ))}
    </View>,
  ];

  return (
    <SafeAreaView className="flex-1 bg-black">
      {steps[step]}

      {/* Navigation */}
      <View className="px-8 pb-8">
        {/* Step dots */}
        <View className="flex-row justify-center gap-2 mb-6">
          {[0, 1, 2].map(i => (
            <View key={i} className={`w-2 h-2 rounded-full ${i === step ? 'bg-blue-500' : 'bg-gray-700'}`} />
          ))}
        </View>

        <TouchableOpacity
          onPress={() => {
            if (step < 2) setStep(step + 1);
            else handleComplete();
          }}
          className="flex-row items-center justify-center py-4 bg-blue-600 rounded-2xl"
          activeOpacity={0.8}
        >
          <Text className="text-white font-semibold text-base mr-2">
            {step === 0 ? 'Get Started' : step === 1 ? 'Next' : 'Start Using Capsule'}
          </Text>
          {step < 2 && <ChevronRight size={18} color="white" />}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
