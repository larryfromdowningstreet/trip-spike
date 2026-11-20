// Splits a long text across several QR Codes shown in turn ("animated QR"),
// and puts it back together in any order on the scanning side.
// Frame layout: ID:INDEX:TOTAL:PART — every character stays in the QR alphanumeric set.

const ID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const HEADER = /^([0-9A-Z]{4}):(\d{1,3}):(\d{1,3}):/;

export function toFrames(text: string, maxChars: number): string[] {
  const total = Math.max(1, Math.ceil(text.length / maxChars));
  const id = shortId(text);
  return Array.from(
    { length: total },
    (_, i) => `${id}:${i + 1}:${total}:${text.slice(i * maxChars, (i + 1) * maxChars)}`,
  );
}

export interface Progress {
  received: number;
  total: number;
  text?: string; // set once every frame has arrived
}

export class FrameCollector {
  private id = '';
  private parts: (string | undefined)[] = [];

  /** Returns undefined for anything that is not one of our frames. */
  add(frame: string): Progress | undefined {
    const m = HEADER.exec(frame);
    if (!m) return undefined;
    const [head, id, index, total] = [m[0], m[1], Number(m[2]), Number(m[3])];
    if (total < 1 || index < 1 || index > total) return undefined;

    if (id !== this.id || this.parts.length !== total) {
      this.id = id; // a different sequence started: begin again
      this.parts = Array.from({ length: total }, () => undefined);
    }
    this.parts[index - 1] = frame.slice(head.length);

    const received = this.parts.filter((p) => p !== undefined).length;
    return { received, total, text: received === total ? this.parts.join('') : undefined };
  }
}

function shortId(text: string): string {
  let h = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  let id = '';
  for (let i = 0; i < 4; i++, h = Math.floor(h / 36)) id += ID_CHARS[h % 36];
  return id;
}
