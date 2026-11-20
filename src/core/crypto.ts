// Keys, using only the browser's built-in Web Crypto.

type Bytes = Uint8Array<ArrayBuffer>;

const CURVE = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const;

export interface Identity {
  name: string;
  publicKey: Bytes; // 65 bytes, shared with others
  privateKey: CryptoKey; // non-extractable: it never leaves this device
}

export interface Peer {
  name: string;
  publicKey: Bytes;
}

export async function createIdentity(name: string): Promise<Identity> {
  const pair = await crypto.subtle.generateKey(CURVE, false, ['sign', 'verify']);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return { name, publicKey, privateKey: pair.privateKey };
}

/** Short fingerprint that identifies a public key inside a package. */
export async function keyId(publicKey: Bytes): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', publicKey)).slice(0, 8);
}

export const importVerifyKey = (publicKey: Bytes) =>
  crypto.subtle.importKey('raw', publicKey, CURVE, false, ['verify']);

export const sign = async (key: CryptoKey, data: Bytes): Promise<Bytes> =>
  new Uint8Array(await crypto.subtle.sign(SIGN, key, data));

export const verify = (key: CryptoKey, signature: Bytes, data: Bytes) =>
  crypto.subtle.verify(SIGN, key, signature, data);

export const randomTripKey = (): Bytes => crypto.getRandomValues(new Uint8Array(32));

export const importTripKey = (raw: Bytes) =>
  crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

export const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i]);
