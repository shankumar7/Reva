// Free push notifications (Firebase). The notification is only a generic "something new". It never has names or text.
import * as Notifications from 'expo-notifications';
import { whileSystemUi } from './lockGuard';

export type PushResult = { ok: true; token: string } | { ok: false; reason: 'denied' | 'unavailable'; detail?: string };

export async function getPushToken(): Promise<PushResult> {
  try {
    Notifications.setNotificationHandler({
      // while the app is open nothing pops up
      handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }),
    });
    await Notifications.setNotificationChannelAsync('general', { name: 'General', importance: Notifications.AndroidImportance.DEFAULT });
    const perm = await whileSystemUi(() => Notifications.requestPermissionsAsync());
    if (!perm.granted) return { ok: false, reason: 'denied' };
    const t = await Notifications.getDevicePushTokenAsync();
    return { ok: true, token: String(t.data) };
  } catch (e) {
    // most likely: this build was made without the Firebase file
    return { ok: false, reason: 'unavailable', detail: e instanceof Error ? e.message : String(e) };
  }
}
