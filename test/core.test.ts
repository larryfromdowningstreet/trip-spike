import { describe, expect, it } from 'vitest';
import { decodeBase45, encodeBase45 } from '../src/core/base45';
import { FrameCollector, toFrames } from '../src/core/frames';
import { createIdentity, importTripKey, importVerifyKey, keyId, randomTripKey } from '../src/core/crypto';
import { decodePairing, encodePairing, openUpdate, PackageError, sealUpdate } from '../src/core/codec';

const utf8 = (s: string) => new TextEncoder().encode(s);

describe('base45', () => {
  it('matches the RFC 9285 examples', () => {
    expect(encodeBase45(utf8('AB'))).toBe('BB8');
    expect(encodeBase45(utf8('Hello!!'))).toBe('%69 VD92EX0');
    expect(encodeBase45(utf8('base-45'))).toBe('UJCLQE7W581');
    expect(new TextDecoder().decode(decodeBase45('QED8WEX0'))).toBe('ietf!');
  });

  it('round-trips every byte value', () => {
    const bytes = Uint8Array.from({ length: 257 }, (_, i) => i % 256);
    expect(decodeBase45(encodeBase45(bytes))).toEqual(bytes);
  });

  it('rejects bad input', () => {
    expect(() => decodeBase45('GGW')).toThrow(); // 65535 < value
    expect(() => decodeBase45('a')).toThrow();
  });
});

describe('frames', () => {
  it('reassembles frames in any order, ignoring repeats', () => {
    const text = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(10);
    const frames = toFrames(text, 37);
    const collector = new FrameCollector();
    const order = [...frames].reverse();
    let last;
    for (const f of [order[0], ...order]) last = collector.add(f);
    expect(last).toMatchObject({ received: frames.length, total: frames.length, text });
  });

  it('ignores text that is not a frame', () => {
    expect(new FrameCollector().add('https://example.com')).toBeUndefined();
  });
});

describe('update package', () => {
  async function setup() {
    const me = await createIdentity('小明');
    const id = await keyId(me.publicKey);
    const verifyKey = await importVerifyKey(me.publicKey);
    const tripKey = await importTripKey(randomTripKey());
    const findKey = async (authorId: Uint8Array) =>
      authorId.every((v, i) => v === id[i]) ? verifyKey : undefined;
    return { author: { id, key: me.privateKey }, tripKey, findKey };
  }

  it('opens what it sealed', async () => {
    const { author, tripKey, findKey } = await setup();
    const data = { ops: [{ seq: 1, title: '伏見稻荷大社' }] };
    const sealed = await sealUpdate(data, author, tripKey);
    expect((await openUpdate(sealed, findKey, tripKey)).data).toEqual(data);
  });

  it('rejects a tampered package before decrypting', async () => {
    const { author, tripKey, findKey } = await setup();
    const sealed = await sealUpdate({ a: 1 }, author, tripKey);
    sealed[25] ^= 0xff;
    await expect(openUpdate(sealed, findKey, tripKey)).rejects.toMatchObject({ code: 'bad-signature' });
  });

  it('rejects an author who is not trusted', async () => {
    const { author, tripKey } = await setup();
    const sealed = await sealUpdate({ a: 1 }, author, tripKey);
    await expect(openUpdate(sealed, async () => undefined, tripKey)).rejects.toBeInstanceOf(PackageError);
  });

  it('rejects the wrong trip key', async () => {
    const { author, tripKey, findKey } = await setup();
    const sealed = await sealUpdate({ a: 1 }, author, tripKey);
    const other = await importTripKey(randomTripKey());
    await expect(openUpdate(sealed, findKey, other)).rejects.toMatchObject({ code: 'decrypt' });
  });
});

describe('pairing', () => {
  it('round-trips', async () => {
    const me = await createIdentity('小華');
    const pairing = { name: me.name, publicKey: me.publicKey, tripKey: randomTripKey() };
    expect(decodePairing(encodePairing(pairing))).toEqual(pairing);
  });
});
