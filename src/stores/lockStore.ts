import { create } from 'zustand';
import { Platform } from 'react-native';
import { isSameCalendarDay } from '../lib/timeUtils';

// The bypass is a demo/dev affordance only — it must never be reachable in a
// native production build (App Store / TestFlight). Web preview + __DEV__ only.
const BYPASS_ALLOWED = Platform.OS === 'web' || __DEV__;

interface LockState {
  // Settings
  unlockHour: number;       // 0-23
  unlockMinute: number;     // 0-59
  windowDurationMinutes: number; // default 120 (2 hours)

  // Runtime state
  isUnlocked: boolean;
  biometricVerified: boolean;
  lastLockEpoch: number;    // anti-tampering
  graceUntilEpoch: number;  // transient 10-min "grace check" after a missed window
  lastGraceEpoch: number;   // when the last grace check was opened (one per day)
  onboardingComplete: boolean;

  // Actions
  setUnlockTime: (hour: number, minute: number) => void;
  setWindowDuration: (minutes: number) => void;
  checkLockState: () => void;
  setBiometricVerified: (v: boolean) => void;
  openGraceWindow: (minutes: number) => void;
  bypassUnlock: () => void; // TEST ONLY — open the box immediately, ignoring the schedule
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
  graceUntilEpoch: 0,
  lastGraceEpoch: 0,
  onboardingComplete: false,

  setUnlockTime: (hour, minute) => set({ unlockHour: hour, unlockMinute: minute }),
  setWindowDuration: (minutes) => set({ windowDurationMinutes: minutes }),

  checkLockState: () => {
    const { unlockHour, unlockMinute, windowDurationMinutes, lastLockEpoch, graceUntilEpoch } = get();
    const now = Date.now();

    // Anti-tamper: if current time is before last lock, stay locked
    if (lastLockEpoch > 0 && now < lastLockEpoch) {
      set({ isUnlocked: false, biometricVerified: false });
      return;
    }

    const openable = isWithinWindow(unlockHour, unlockMinute, windowDurationMinutes) || now < graceUntilEpoch;

    if (!openable) {
      set({ isUnlocked: false, biometricVerified: false });
    }
    // Don't auto-unlock — require biometric verification (or an explicit grace check)
  },

  setBiometricVerified: (v) => {
    const { unlockHour, unlockMinute, windowDurationMinutes, graceUntilEpoch } = get();
    const openable = isWithinWindow(unlockHour, unlockMinute, windowDurationMinutes) || Date.now() < graceUntilEpoch;
    if (v && openable) {
      set({ biometricVerified: true, isUnlocked: true });
    }
  },

  // A missed-window "10-minute check": opens the box immediately for `minutes`.
  // Clamp to a sane finite range so a bad caller can't open an unbounded window
  // (which would keep encrypted content decryptable indefinitely).
  openGraceWindow: (minutes) => {
    const now = Date.now();
    const { lastGraceEpoch, unlockHour, unlockMinute, windowDurationMinutes } = get();
    // Grace is ONLY for a missed window — never during the normal open window
    // (would otherwise extend access past the configured window).
    if (isWithinWindow(unlockHour, unlockMinute, windowDurationMinutes)) return;
    // Enforce one grace check per calendar day at the store level (authoritative,
    // independent of any UI gating).
    if (lastGraceEpoch > 0 && isSameCalendarDay(lastGraceEpoch, now)) return;
    const safe = Number.isFinite(minutes) ? Math.min(Math.max(minutes, 1), 60) : 10;
    set({ graceUntilEpoch: now + safe * 60 * 1000, lastGraceEpoch: now, isUnlocked: true, biometricVerified: true });
  },

  // TEST ONLY: open immediately regardless of the window (60-min hold so it doesn't
  // instantly re-lock). Remove before release.
  bypassUnlock: () => { if (!BYPASS_ALLOWED) return; set({ graceUntilEpoch: Date.now() + 60 * 60 * 1000, isUnlocked: true, biometricVerified: true }); },

  lock: () => set({ isUnlocked: false, biometricVerified: false, graceUntilEpoch: 0, lastLockEpoch: Date.now() }),

  setOnboardingComplete: (v) => set({ onboardingComplete: v }),

  hydrate: (data) => set(data),
}));
