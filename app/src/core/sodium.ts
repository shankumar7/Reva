import * as ExpoCrypto from 'expo-crypto';
import { makeCrypto, type Crypto } from '../../../shared/crypto';
import { createSodiumLite } from './sodiumLite';

// the phone's secure random numbers
const rand = (n: number) => ExpoCrypto.getRandomValues(new Uint8Array(n));

export const rawSodium = createSodiumLite(rand);
let c: Crypto | null = null;

export async function getCrypto(): Promise<Crypto> {
  if (!c) c = makeCrypto(rawSodium);
  return c;
}
