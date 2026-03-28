import { create } from 'zustand';

interface LockState {
  // Settings
  unlockHour: number;       // 0-23
  unlockMinute: number;     // 0-59
  windowDurationMinutes: number; // default 120 (2 hours)

  // Runtime state
  isUnlocked: boolean;
  biometricVerified: boolean;
  lastLockEpoch: number;    // anti-tampering
  onboardingComplete: boolean;

  // Actions
  setUnlockTime: (hour: number, minute: number) => void;
  setWindowDuration: (minutes: number) => void;
  checkLockState: () => void;
  setBiometricVerified: (v: boolean) => void;
  lock: () => void;
  setOnboardingComplete: (v: boolean) => void;
  hydrate: (data: Partial<LockState>) => void;
}

function isWithinWindow(unlockHour: number, unlockMinute: number, windowMinutes: number): boolean {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), unlockHour, unlockMinute, 0);
  const windowEnd = new Date(today.getTime() + windowMinutes * 60 * 1000);

  return now >= today && now < windowEnd;
}

export const useLockStore = create<LockState>((set, get) => ({
  unlockHour: 20,
  unlockMinute: 0,
  windowDurationMinutes: 120,
  isUnlocked: false,
  biometricVerified: false,
  lastLockEpoch: 0,
  onboardingComplete: false,

  setUnlockTime: (hour, minute) => set({ unlockHour: hour, unlockMinute: minute }),
  setWindowDuration: (minutes) => set({ windowDurationMinutes: minutes }),

  checkLockState: () => {
    const { unlockHour, unlockMinute, windowDurationMinutes, lastLockEpoch } = get();
    const now = Date.now();

    // Anti-tamper: if current time is before last lock, stay locked
    if (lastLockEpoch > 0 && now < lastLockEpoch) {
      set({ isUnlocked: false, biometricVerified: false });
      return;
    }

    const withinWindow = isWithinWindow(unlockHour, unlockMinute, windowDurationMinutes);

    if (!withinWindow) {
      set({ isUnlocked: false, biometricVerified: false });
    }
    // Don't auto-unlock — require biometric verification
  },

  setBiometricVerified: (v) => {
    const { unlockHour, unlockMinute, windowDurationMinutes } = get();
    if (v && isWithinWindow(unlockHour, unlockMinute, windowDurationMinutes)) {
      set({ biometricVerified: true, isUnlocked: true });
    }
  },

  lock: () => set({ isUnlocked: false, biometricVerified: false, lastLockEpoch: Date.now() }),

  setOnboardingComplete: (v) => set({ onboardingComplete: v }),

  hydrate: (data) => set(data),
}));
