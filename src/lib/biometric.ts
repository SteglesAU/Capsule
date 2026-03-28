import * as LocalAuthentication from 'expo-local-authentication';

export async function authenticateWithBiometrics(): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return true; // No biometric hardware — allow through

  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  if (!isEnrolled) return true; // No biometrics enrolled — allow through

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock Capsule',
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
  });

  return result.success;
}
