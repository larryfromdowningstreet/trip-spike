// Binary formats carried inside the QR Codes.
//
// Update package (kind 0x01):
//   [kind 1][author key id 8][iv 12][AES-GCM ciphertext of deflate(JSON)][ECDSA signature 64]
//   The signature covers everything before it, so it is checked before anything is decrypted or parsed.
//
// Pairing (kind 0x50, test build only — the real app sends the trip key encrypted per member):
//   [kind 1][name length 1][name UTF-8][public key 65][trip key 32]

import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { sign, verify } from './crypto';

type Bytes = Uint8Array<ArrayBuffer>;

const UPDATE = 0x01;
const PAIRING = 0x50;
const ID = 8;
const IV = 12;
const TAG = 16;
const SIG = 64;
const PUBLIC_KEY = 65;
const TRIP_KEY = 32;
const MAX_BYTES = 64 * 1024; // refuse anything larger before doing any work

export type ErrorCode = 'format' | 'unknown-author' | 'bad-signature' | 'decrypt';

export class PackageError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}

export function kindOf(bytes: Uint8Array): 'update' | 'pairing' | undefined {
  if (bytes[0] === UPDATE) return 'update';
  if (bytes[0] === PAIRING) return 'pairing';
  return undefined;
}

/** Sizes before encryption, for the test screen. */
export function measure(data: unknown) {
  const json = strToU8(JSON.stringify(data));
  return { json: json.length, compressed: deflateSync(json, { level: 9 }).length };
}

export async function sealUpdate(
  data: unknown,
  author: { id: Bytes; key: CryptoKey },
  tripKey: CryptoKey,
): Promise<Bytes> {
  const iv = crypto.getRandomValues(new Uint8Array(IV));
  const plain = deflateSync(strToU8(JSON.stringify(data)), { level: 9 });
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, tripKey, plain));
  const body = concat([UPDATE], author.id, iv, cipher);
  return concat(body, await sign(author.key, body));
}

export async function openUpdate(
  bytes: Bytes,
  findKey: (authorId: Bytes) => Promise<CryptoKey | undefined>,
  tripKey: CryptoKey,
): Promise<{ authorId: Bytes; data: unknown }> {
  if (bytes.length > MAX_BYTES || bytes.length < 1 + ID + IV + TAG + SIG || bytes[0] !== UPDATE) {
    throw new PackageError('format');
  }
  const body = bytes.subarray(0, bytes.length - SIG);
  const authorId = body.slice(1, 1 + ID);

  const key = await findKey(authorId);
  if (!key) throw new PackageError('unknown-author');
  if (!(await verify(key, bytes.subarray(bytes.length - SIG), body))) {
    throw new PackageError('bad-signature');
  }

  let plain: ArrayBuffer;
  try {
    const iv = body.subarray(1 + ID, 1 + ID + IV);
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, tripKey, body.subarray(1 + ID + IV));
  } catch {
    throw new PackageError('decrypt');
  }
  try {
    return { authorId, data: JSON.parse(strFromU8(inflateSync(new Uint8Array(plain)))) };
  } catch {
    throw new PackageError('format');
  }
}

export interface Pairing {
  name: string;
  publicKey: Bytes;
  tripKey: Bytes;
}

export function encodePairing({ name, publicKey, tripKey }: Pairing): Bytes {
  const nameBytes = strToU8(name);
  if (nameBytes.length > 255) throw new Error('name too long');
  return concat([PAIRING, nameBytes.length], nameBytes, publicKey, tripKey);
}

export function decodePairing(bytes: Bytes): Pairing {
  const nameLength = bytes[1] ?? 0;
  if (bytes[0] !== PAIRING || bytes.length !== 2 + nameLength + PUBLIC_KEY + TRIP_KEY) {
    throw new PackageError('format');
  }
  const keysAt = 2 + nameLength;
  return {
    name: strFromU8(bytes.slice(2, keysAt)),
    publicKey: bytes.slice(keysAt, keysAt + PUBLIC_KEY),
    tripKey: bytes.slice(keysAt + PUBLIC_KEY),
  };
}

function concat(...parts: ArrayLike<number>[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
