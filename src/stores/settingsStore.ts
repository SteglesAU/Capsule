import { create } from 'zustand';

interface SettingsState {
  notifyOnUnlock: boolean;
  notifyReminder: boolean;
  autoDeleteAfterReview: boolean;
  hapticsEnabled: boolean;
  biometricEnabled: boolean;

  setNotifyOnUnlock: (v: boolean) => void;
  setNotifyReminder: (v: boolean) => void;
  setAutoDeleteAfterReview: (v: boolean) => void;
  setHapticsEnabled: (v: boolean) => void;
  setBiometricEnabled: (v: boolean) => void;
  hydrate: (data: Partial<SettingsState>) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  notifyOnUnlock: true,
  notifyReminder: true,
  autoDeleteAfterReview: false,
  hapticsEnabled: true,
  biometricEnabled: true,

  setNotifyOnUnlock: (v) => set({ notifyOnUnlock: v }),
  setNotifyReminder: (v) => set({ notifyReminder: v }),
  setAutoDeleteAfterReview: (v) => set({ autoDeleteAfterReview: v }),
  setHapticsEnabled: (v) => set({ hapticsEnabled: v }),
  setBiometricEnabled: (v) => set({ biometricEnabled: v }),
  hydrate: (data) => set(data),
}));
