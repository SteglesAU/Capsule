import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '../stores/settingsStore';

export function triggerHaptic(type: 'success' | 'light' | 'medium' | 'error' = 'light') {
  if (!useSettingsStore.getState().hapticsEnabled) return;
  switch (type) {
    case 'success': Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); break;
    case 'error': Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); break;
    case 'medium': Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); break;
    default: Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}
