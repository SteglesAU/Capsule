import { getSetting, setSetting } from '../db/database';
import { useLockStore } from '../stores/lockStore';
import { useSettingsStore } from '../stores/settingsStore';

const LOCK_KEYS = ['unlockHour', 'unlockMinute', 'windowDurationMinutes', 'lastLockEpoch', 'onboardingComplete'] as const;
const SETTINGS_KEYS = ['notifyOnUnlock', 'notifyReminder', 'autoDeleteAfterReview', 'hapticsEnabled', 'biometricEnabled'] as const;

export async function loadPersistedState(): Promise<void> {
  const lockData: Record<string, any> = {};
  for (const key of LOCK_KEYS) {
    const val = await getSetting(`lock.${key}`);
    if (val !== null) {
      if (key === 'onboardingComplete') lockData[key] = val === 'true';
      else lockData[key] = parseInt(val, 10);
    }
  }
  if (Object.keys(lockData).length > 0) useLockStore.getState().hydrate(lockData);

  const settingsData: Record<string, any> = {};
  for (const key of SETTINGS_KEYS) {
    const val = await getSetting(`settings.${key}`);
    if (val !== null) settingsData[key] = val === 'true';
  }
  if (Object.keys(settingsData).length > 0) useSettingsStore.getState().hydrate(settingsData);
}

export async function persistLockState(): Promise<void> {
  const state = useLockStore.getState();
  for (const key of LOCK_KEYS) {
    await setSetting(`lock.${key}`, String(state[key]));
  }
}

export async function persistSettings(): Promise<void> {
  const state = useSettingsStore.getState();
  for (const key of SETTINGS_KEYS) {
    await setSetting(`settings.${key}`, String(state[key]));
  }
}
