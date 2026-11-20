// Base45 (RFC 9285): bytes ↔ QR Code alphanumeric characters.
// Same density as binary mode, but every scanner reads it back as plain text.

export const BASE45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

export function encodeBase45(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      const n = bytes[i] * 256 + bytes[i + 1];
      out += BASE45[n % 45] + BASE45[Math.floor(n / 45) % 45] + BASE45[Math.floor(n / 2025)];
    } else {
      out += BASE45[bytes[i] % 45] + BASE45[Math.floor(bytes[i] / 45)];
    }
  }
  return out;
}

export function decodeBase45(text: string): Uint8Array<ArrayBuffer> {
  const values = [...text].map((c) => {
    const v = BASE45.indexOf(c);
    if (v < 0) throw new Error('base45: invalid character');
    return v;
  });
  if (values.length % 3 === 1) throw new Error('base45: invalid length');

  const out: number[] = [];
  for (let i = 0; i < values.length; i += 3) {
    if (i + 2 < values.length) {
      const n = values[i] + values[i + 1] * 45 + values[i + 2] * 2025;
      if (n > 0xffff) throw new Error('base45: value out of range');
      out.push(n >> 8, n & 0xff);
    } else {
      const n = values[i] + values[i + 1] * 45;
      if (n > 0xff) throw new Error('base45: value out of range');
      out.push(n);
    }
  }
  return Uint8Array.from(out);
}
