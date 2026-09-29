import { create } from 'zustand';

export type ClockFormat = 'system' | '12' | '24';

interface SettingsState {
  notifyOnUnlock: boolean;
  notifyReminder: boolean;
  autoDeleteAfterReview: boolean;
  hapticsEnabled: boolean;
  biometricEnabled: boolean;
  clockFormat: ClockFormat; // 'system' follows the device time-format
  premium: boolean;         // unlocks grouping + AI discuss (default on in the demo; real gating = IAP)

  setNotifyOnUnlock: (v: boolean) => void;
  setNotifyReminder: (v: boolean) => void;
  setAutoDeleteAfterReview: (v: boolean) => void;
  setHapticsEnabled: (v: boolean) => void;
  setBiometricEnabled: (v: boolean) => void;
  setClockFormat: (v: ClockFormat) => void;
  setPremium: (v: boolean) => void;
  hydrate: (data: Partial<SettingsState>) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  notifyOnUnlock: true,
  notifyReminder: true,
  autoDeleteAfterReview: false,
  hapticsEnabled: true,
  biometricEnabled: true,
  clockFormat: 'system',
  premium: true,

  setNotifyOnUnlock: (v) => set({ notifyOnUnlock: v }),
  setNotifyReminder: (v) => set({ notifyReminder: v }),
  setAutoDeleteAfterReview: (v) => set({ autoDeleteAfterReview: v }),
  setHapticsEnabled: (v) => set({ hapticsEnabled: v }),
  setBiometricEnabled: (v) => set({ biometricEnabled: v }),
  setClockFormat: (v) => set({ clockFormat: v }),
  setPremium: (v) => set({ premium: v }),
  hydrate: (data) => set(data),
}));
