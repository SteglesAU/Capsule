import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '../stores/settingsStore';

export function triggerHaptic(type: 'success' | 'light' | 'medium' | 'error' = 'light') {
  if (Platform.OS === 'web') return; // no haptics native module on web
  if (!useSettingsStore.getState().hapticsEnabled) return;
  const noop = () => {}; // haptics must never break a flow if it fails
  switch (type) {
    case 'success': Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(noop); break;
    case 'error': Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(noop); break;
    case 'medium': Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(noop); break;
    default: Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(noop);
  }
}
