import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useLockStore } from '../stores/lockStore';
import { useSettingsStore } from '../stores/settingsStore';
import { getSetting, setSetting } from '../db/database';
import { wasWindowMissedToday } from './timeUtils';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

const GRACE_ACTION = 'capsule-grace-check';

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

function hmFromMinutes(total: number): { hour: number; minute: number } {
  const t = ((total % 1440) + 1440) % 1440; // wrap across midnight
  return { hour: Math.floor(t / 60), minute: t % 60 };
}

/**
 * (Re)schedule the daily notification set for the current schedule + toggles:
 *   1. OPEN          — at the unlock time
 *   2. CLOSING SOON  — 10 min before the window closes  (gated by Daily Reminder)
 *   3. MISSED/CLOSED — at the window close, offers a 10-min grace check
 *
 * NOTE: these are daily-repeating local notifications. Suppressing the closing/
 * missed reminders on days the user DID open requires a background task and is a
 * documented follow-up — see CAPSULE_BUILD_PLAN.md.
 */
export async function scheduleUnlockNotification(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();

  const { unlockHour, unlockMinute, windowDurationMinutes } = useLockStore.getState();
  const { notifyOnUnlock, notifyReminder } = useSettingsStore.getState();

  if (notifyOnUnlock) {
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Capsule is open', body: 'Your box is open — review your captured ideas.' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: unlockHour, minute: unlockMinute },
    });
  }

  if (notifyReminder) {
    const endTotal = unlockHour * 60 + unlockMinute + windowDurationMinutes;
    const soon = hmFromMinutes(endTotal - 10);
    const closed = hmFromMinutes(endTotal);

    await Notifications.scheduleNotificationAsync({
      content: { title: 'Window closing soon', body: 'Your review window closes in 10 minutes. Open Capsule to review today’s ideas.' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: soon.hour, minute: soon.minute },
    });

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Today’s window has closed',
        body: 'Your ideas stay locked until tomorrow. Tap to open a 10-minute check.',
        data: { action: GRACE_ACTION },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: closed.hour, minute: closed.minute },
    });
  }
}

function handleGraceResponse(response: Notifications.NotificationResponse | null): void {
  if (response?.notification.request.content.data?.action !== GRACE_ACTION) return;
  // Only honor the tap if today's window has genuinely opened-and-closed — a
  // stale daily notification tapped at some other time must not open access.
  const { unlockHour, unlockMinute, windowDurationMinutes } = useLockStore.getState();
  if (!wasWindowMissedToday(unlockHour, unlockMinute, windowDurationMinutes)) return;
  useLockStore.getState().openGraceWindow(10);
}

/**
 * Wire the "missed window" notification tap to open a 10-minute grace check.
 * Call once at app start; returns the subscription so it can be cleaned up.
 */
export function registerGraceCheckHandler(): { remove: () => void } | null {
  if (Platform.OS === 'web') return null;
  return Notifications.addNotificationResponseReceivedListener(handleGraceResponse);
}

/**
 * Handle a notification tap that COLD-STARTED the app (terminated state) — the
 * response listener above doesn't receive that one. Call once at app start.
 */
export async function checkInitialGraceResponse(): Promise<void> {
  if (Platform.OS === 'web') return;
  const response = await Notifications.getLastNotificationResponseAsync();
  if (response?.notification.request.content.data?.action !== GRACE_ACTION) return;
  // getLastNotificationResponseAsync returns the SAME response on every cold
  // start, so consume it once (keyed by identifier + delivery time) to avoid
  // reopening the grace window on unrelated later launches.
  const key = `${response.notification.request.identifier}:${response.notification.date}`;
  if ((await getSetting('grace.lastHandledKey')) === key) return;
  await setSetting('grace.lastHandledKey', key);
  // Route through the shared handler so the missed-window guard applies here too.
  handleGraceResponse(response);
}
