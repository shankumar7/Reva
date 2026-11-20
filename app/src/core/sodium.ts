import sodium from 'react-native-libsodium';
import { makeCrypto, type Crypto } from '../../../shared/crypto';

let c: Crypto | null = null;
export async function getCrypto(): Promise<Crypto> {
  if (c) return c;
  await sodium.ready;
  c = makeCrypto(sodium);
  return c;
}
export const rawSodium = sodium;
