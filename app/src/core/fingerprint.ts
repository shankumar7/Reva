// Fingerprint as an extra way into the chat. Fingerprint only: no phone PIN fallback, and the prompt says nothing about this app.
import * as LocalAuthentication from 'expo-local-authentication';
import { whileSystemUi } from './lockGuard';

export type FingerprintCheck = 'ok' | 'no_sensor' | 'not_enrolled';

export async function fingerprintAvailable(): Promise<FingerprintCheck> {
  try {
    if (!(await LocalAuthentication.hasHardwareAsync())) return 'no_sensor';
    if (!(await LocalAuthentication.isEnrolledAsync())) return 'not_enrolled';
    return 'ok';
  } catch {
    return 'no_sensor';
  }
}

/** Shows the system fingerprint prompt. True only if it was recognised. */
export async function askFingerprint(): Promise<boolean> {
  try {
    const r = await whileSystemUi(() =>
      LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirm',
        cancelLabel: 'Cancel',
        disableDeviceFallback: true,
        biometricsSecurityLevel: 'strong',
        requireConfirmation: false,
      }),
    );
    return r.success;
  } catch {
    return false;
  }
}
