// Opens a zip file on the phone's storage by reading only the parts that are needed.
import * as FileSystem from 'expo-file-system/legacy';
import { base64ToBytes, openZip, type ZipArchive } from './zipFile';

export async function openZipFile(uri: string): Promise<ZipArchive> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || typeof info.size !== 'number') throw new Error('Could not open that file.');
  return openZip(info.size, async (position, length) => {
    if (length === 0) return new Uint8Array(0);
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64, position, length });
    return base64ToBytes(b64);
  });
}
