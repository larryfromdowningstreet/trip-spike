// End to end without a camera: sample day → sealed package → QR Codes → decoded by jsQR → opened.
// Also prints how many QR Codes the sample day needs at different settings.

import { describe, expect, it } from 'vitest';
import qrcode from 'qrcode-generator';
import jsQR from 'jsqr';
import { decodeBase45, encodeBase45 } from '../src/core/base45';
import { FrameCollector, toFrames } from '../src/core/frames';
import { createIdentity, importTripKey, importVerifyKey, keyId, randomTripKey } from '../src/core/crypto';
import { measure, openUpdate, sealUpdate } from '../src/core/codec';
import { sample } from '../src/sample';

function scan(text: string, ec: 'L' | 'M') {
  const qr = qrcode(0, ec);
  qr.addData(text, 'Alphanumeric');
  qr.make();
  const modules = qr.getModuleCount();
  const cell = 4;
  const size = (modules + 8) * cell;
  const rgba = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.floor(y / cell) - 4;
      const c = Math.floor(x / cell) - 4;
      if (r >= 0 && c >= 0 && r < modules && c < modules && qr.isDark(r, c)) {
        rgba.fill(0, (y * size + x) * 4, (y * size + x) * 4 + 3);
      }
    }
  }
  return { version: (modules - 17) / 4, read: jsQR(rgba, size, size)?.data };
}

describe('sample day through real QR Codes', async () => {
  const me = await createIdentity('小明');
  const id = await keyId(me.publicKey);
  const verifyKey = await importVerifyKey(me.publicKey);
  const tripKey = await importTripKey(randomTripKey());
  const sealed = await sealUpdate(sample, { id, key: me.privateKey }, tripKey);
  const text = encodeBase45(sealed);
  const sizes = measure(sample);

  console.log(
    `sample day: ${sample.ops.length} items · JSON ${sizes.json} B · deflate ${sizes.compressed} B · ` +
      `sealed ${sealed.length} B · base45 ${text.length} chars`,
  );

  for (const ec of ['L', 'M'] as const) {
    for (const maxChars of [400, 700, 1000, 2000]) {
      it(`EC ${ec}, ${maxChars} chars per QR`, async () => {
        const frames = toFrames(text, maxChars);
        const collector = new FrameCollector();
        const versions: number[] = [];
        let result;
        for (const frame of frames) {
          const { version, read } = scan(frame, ec);
          versions.push(version);
          expect(read).toBe(frame);
          result = collector.add(read!);
        }
        console.log(`EC ${ec} · ${maxChars} chars/QR → ${frames.length} QR, version ≤ ${Math.max(...versions)}`);
        const opened = await openUpdate(decodeBase45(result!.text!), async () => verifyKey, tripKey);
        expect(opened.data).toEqual(sample);
      });
    }
  }
});
