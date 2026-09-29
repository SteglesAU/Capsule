import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLockStore } from '../stores/lockStore';
import { useSettingsStore } from '../stores/settingsStore';
import { loadPersistedState } from '../lib/persistence';
import { getDatabase } from '../db/database';
import { isWithinReviewWindow } from '../lib/timeUtils';
import { authenticateWithBiometrics } from '../lib/biometric';
import { registerGraceCheckHandler, checkInitialGraceResponse } from '../lib/notifications';
import { OnboardingScreen } from './OnboardingScreen';
import { LockedScreen } from './LockedScreen';
import { ReviewScreen } from './ReviewScreen';
import { SettingsScreen } from './SettingsScreen';

export function AppRoot() {
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const { onboardingComplete, isUnlocked, checkLockState } = useLockStore();

  // Initialize on mount
  useEffect(() => {
    (async () => {
      try {
        await getDatabase();
        await loadPersistedState();
        useLockStore.getState().checkLockState();
      } catch (e) {
        // Never hang on the loading screen if init fails (e.g. storage quirks on web).
        console.warn('Capsule init error', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Check lock state periodically
  useEffect(() => {
    const interval = setInterval(() => checkLockState(), 10000);
    return () => clearInterval(interval);
  }, [checkLockState]);

  // Tapping the "missed window" notification opens a 10-minute grace check
  // (both while running, and when a tap cold-starts the app).
  useEffect(() => {
    checkInitialGraceResponse();
    const sub = registerGraceCheckHandler();
    return () => sub?.remove();
  }, []);

  // Open the review window when it becomes due. TIME-DRIVEN (polls) so it fires
  // even if the window opens while the locked screen is showing — the previous
  // dependency-based effect never re-ran as the clock passed the unlock time.
  // Prompts biometric once per open window; the locked screen also has an explicit
  // "Open box" button so a missed auto-prompt can always be retried.
  useEffect(() => {
    let cancelled = false;
    const prompted = { current: false };
    const check = () => {
      const st = useLockStore.getState();
      if (!st.onboardingComplete || st.isUnlocked) return;
      const open = isWithinReviewWindow(st.unlockHour, st.unlockMinute, st.windowDurationMinutes) || Date.now() < st.graceUntilEpoch;
      if (!open) { prompted.current = false; return; } // reset for the next window
      if (prompted.current) return;                    // already prompted this window
      prompted.current = true;
      if (useSettingsStore.getState().biometricEnabled) {
        authenticateWithBiometrics().then(ok => { if (!cancelled && ok) useLockStore.getState().setBiometricVerified(true); });
      } else if (!cancelled) {
        useLockStore.getState().setBiometricVerified(true);
      }
    };
    check();
    const id = setInterval(check, 1500);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

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
  return <LockedScreen onSettings={() => setShowSettings(true)} />;
}
