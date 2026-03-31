import * as Notifications from 'expo-notifications';
import { useLockStore } from '../stores/lockStore';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleUnlockNotification(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();

  const { unlockHour, unlockMinute } = useLockStore.getState();

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Capsule Unlocked',
      body: 'Your box is open. Review your captured ideas.',
    },
    trigger: {
      hour: unlockHour,
      minute: unlockMinute,
      repeats: true,
    } as Notifications.DailyTriggerInput,
  });
}
