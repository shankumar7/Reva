// Make and restore an encrypted backup of this phone's chat. The file can be saved to Google Drive
// (or anywhere) through the phone's Share menu. Only your passphrase can open it.
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { rawSodium, getCrypto } from './sodium';
import { pack, unpack } from './backupCrypto';
import { Vault, type Settings } from './storage';
import { Messages, SharedNotes, openDb, wipeDb, type Msg, type SharedNote } from './db';
import * as Images from './images';
import { whileSystemUi } from './lockGuard';

interface BackupData {
  v: 1;
  created: number;
  seed: string;
  pairing: { serverUrl: string; peerSignPk: string | null };
  settings: Settings;
  messages: Omit<Msg, 'imgKey'>[];
  snotes: SharedNote[];
  photos: Record<string, string>; // id -> base64 jpeg
}

const pause = () => new Promise((r) => setTimeout(r, 60)); // lets the screen update before heavy work

export async function createBackup(
  passphrase: string, includePhotos: boolean, settings: Settings, onStatus: (s: string) => void,
): Promise<string> {
  const c = await getCrypto();
  const seed = await Vault.seed(false);
  const pairing = await Vault.pairing();
  if (!seed || !pairing) throw new Error('Nothing to back up yet.');
  onStatus('Collecting messages…'); await pause();
  const all = await Messages.all();
  const photos: Record<string, string> = {};
  if (includePhotos) {
    const imgs = all.filter((m) => m.kind === 'img' && m.imgKey && !m.deleted).slice(-200);
    for (let i = 0; i < imgs.length; i++) {
      onStatus(`Adding photos ${i + 1} of ${imgs.length}…`);
      try { photos[imgs[i].id] = await Images.load(imgs[i].id, imgs[i].imgKey); } catch { /* skip a missing file */ }
    }
  }
  const data: BackupData = {
    v: 1, created: Date.now(), seed: c.b64(seed),
    pairing: { serverUrl: pairing.serverUrl, peerSignPk: pairing.peerSignPk },
    settings,
    messages: all.map(({ imgKey: _k, ...m }) => m),
    snotes: await SharedNotes.all(),
    photos,
  };
  onStatus('Encrypting…'); await pause();
  const bytes = pack(rawSodium, rawSodium.from_string(JSON.stringify(data)), passphrase);
  onStatus('Saving the file…'); await pause();
  const day = new Date().toISOString().slice(0, 10);
  const uri = (FileSystem.cacheDirectory ?? '') + `backup-${day}.rvb`;
  await FileSystem.writeAsStringAsync(uri, c.b64(bytes).replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (Math.ceil((bytes.length * 4) / 3) % 4)) % 4), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uri;
}

/** Opens the phone's Share menu so the file can go to Google Drive. */
export async function shareBackup(uri: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await whileSystemUi(() => Sharing.shareAsync(uri, { mimeType: 'application/octet-stream', dialogTitle: 'Save your backup (choose Drive)' }));
  return true;
}

export async function restoreBackup(fileUri: string, passphrase: string, onStatus: (s: string) => void): Promise<void> {
  const c = await getCrypto();
  onStatus('Reading the file…'); await pause();
  const b64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
  const file = rawSodium.from_base64(b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
  onStatus('Unlocking…'); await pause();
  const json = unpack(rawSodium, file, passphrase);
  const data = JSON.parse(rawSodium.to_string(json)) as BackupData;
  if (data.v !== 1 || !data.seed) throw new Error('This backup is from a newer version of the app.');

  onStatus('Restoring…'); await pause();
  await wipeDb();
  await Images.wipeAll();
  await Vault.setSeed(c.unb64(data.seed));
  await Vault.savePairing({ serverUrl: data.pairing.serverUrl, token: '', peerSignPk: data.pairing.peerSignPk, registered: true });
  await Vault.saveSettings(data.settings);
  await openDb();
  for (let i = 0; i < data.messages.length; i++) {
    const m = data.messages[i];
    let imgKey = '';
    if (m.kind === 'img' && data.photos[m.id]) imgKey = await Images.store(m.id, data.photos[m.id]);
    await Messages.insert({ ...m, imgKey });
    if (i % 100 === 0) onStatus(`Restoring messages ${i} of ${data.messages.length}…`);
  }
  for (const n of data.snotes) await SharedNotes.put(n);
}

/** The whole chat as a readable text file, in the same layout WhatsApp uses. NOT encrypted: share it carefully. */
export async function exportText(nickname: string): Promise<string> {
  const all = await Messages.all();
  const pad = (n: number) => String(n).padStart(2, '0');
  const lines = all
    .filter((m) => !m.deleted)
    .map((m) => {
      const d = new Date(m.ts);
      const when = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      const who = m.mine ? 'Me' : nickname || 'Partner';
      const body = m.kind === 'img' ? '<photo>' + (m.text ? ' ' + m.text : '') : m.kind === 'aud' ? `<voice note ${m.w}s>` : m.text;
      return `${when} - ${who}: ${body}`;
    });
  const uri = (FileSystem.cacheDirectory ?? '') + 'chat-' + new Date().toISOString().slice(0, 10) + '.txt';
  await FileSystem.writeAsStringAsync(uri, lines.join('\n'));
  return uri;
}
