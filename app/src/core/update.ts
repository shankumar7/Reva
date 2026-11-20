// "Check for updates": asks your own server for a newer app file, and offers to install it.
import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { getCrypto } from './sodium';
import { Vault } from './storage';

export interface UpdateInfo { versionCode: number; versionName: string; notes?: string }
export type UpdateResult =
  | { kind: 'latest'; current: string }
  | { kind: 'available'; info: UpdateInfo }
  | { kind: 'error'; message: string };

async function authHeaders(): Promise<{ base: string; headers: Record<string, string> } | null> {
  const p = await Vault.pairing();
  const seed = await Vault.seed(false);
  if (!p || !seed) return null;
  const c = await getCrypto();
  const id = c.identityFromSeed(seed);
  const minute = String(Math.floor(Date.now() / 60000));
  const base = p.serverUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
  return { base, headers: { 'x-device': c.b64(id.signPk), 'x-minute': minute, 'x-sig': c.signChallenge(id, 'update|' + minute) } };
}

export const currentVersion = () => `${Application.nativeApplicationVersion ?? '?'} (${Application.nativeBuildVersion ?? '?'})`;

export async function checkForUpdate(): Promise<UpdateResult> {
  try {
    const a = await authHeaders();
    if (!a) return { kind: 'error', message: 'Not set up yet.' };
    const r = await fetch(a.base + '/update/latest.json', { headers: a.headers });
    if (r.status === 404) return { kind: 'latest', current: currentVersion() }; // nothing published on the server
    if (!r.ok) return { kind: 'error', message: 'The server said no (' + r.status + ').' };
    const info = (await r.json()) as UpdateInfo;
    const mine = Number(Application.nativeBuildVersion ?? 0);
    return info.versionCode > mine ? { kind: 'available', info } : { kind: 'latest', current: currentVersion() };
  } catch {
    return { kind: 'error', message: 'Could not reach the server.' };
  }
}

export async function downloadAndInstall(onStatus: (s: string) => void): Promise<string | null> {
  try {
    const a = await authHeaders();
    if (!a) return 'Not set up yet.';
    onStatus('Downloading…');
    const dest = FileSystem.cacheDirectory + 'update.apk';
    const res = await FileSystem.downloadAsync(a.base + '/update/app.apk', dest, { headers: a.headers });
    if (res.status !== 200) return 'Download failed (' + res.status + ').';
    onStatus('Opening installer…');
    const uri = await FileSystem.getContentUriAsync(res.uri);
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: uri, flags: 1, type: 'application/vnd.android.package-archive' });
    return null;
  } catch {
    return 'Could not install. If Android asked, allow installs from this app and try again.';
  }
}
