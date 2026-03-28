import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLockStore } from '../stores/lockStore';
import { useSettingsStore } from '../stores/settingsStore';
import { loadPersistedState } from '../lib/persistence';
import { getDatabase } from '../db/database';
import { isWithinReviewWindow } from '../lib/timeUtils';
import { authenticateWithBiometrics } from '../lib/biometric';
import { OnboardingScreen } from './OnboardingScreen';
import { LockedScreen } from './LockedScreen';
import { ReviewScreen } from './ReviewScreen';
import { SettingsScreen } from './SettingsScreen';

export function AppRoot() {
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const { onboardingComplete, isUnlocked, unlockHour, unlockMinute, windowDurationMinutes, checkLockState, setBiometricVerified } = useLockStore();
  const { biometricEnabled } = useSettingsStore();
  const [attemptedBiometric, setAttemptedBiometric] = useState(false);

  // Initialize on mount
  useEffect(() => {
    (async () => {
      await getDatabase();
      await loadPersistedState();
      useLockStore.getState().checkLockState();
      setLoading(false);
    })();
  }, []);

  // Check lock state periodically
  useEffect(() => {
    const interval = setInterval(() => checkLockState(), 10000);
    return () => clearInterval(interval);
  }, [checkLockState]);

  // Auto-prompt biometric when within review window
  useEffect(() => {
    if (loading || !onboardingComplete || isUnlocked || attemptedBiometric) return;

    const withinWindow = isWithinReviewWindow(unlockHour, unlockMinute, windowDurationMinutes);
    if (withinWindow) {
      setAttemptedBiometric(true);
      if (biometricEnabled) {
        authenticateWithBiometrics().then(success => {
          if (success) setBiometricVerified(true);
        });
      } else {
        setBiometricVerified(true);
      }
    }
  }, [loading, onboardingComplete, isUnlocked, attemptedBiometric, unlockHour, unlockMinute, windowDurationMinutes, biometricEnabled, setBiometricVerified]);

  if (loading) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator color="#60A5FA" size="large" />
      </View>
    );
  }

  if (!onboardingComplete) return <OnboardingScreen />;
  if (showSettings) return <SettingsScreen onBack={() => setShowSettings(false)} />;
  if (isUnlocked) return <ReviewScreen />;
  return <LockedScreen />;
}
