import './style.css';
import { decodeBase45, encodeBase45 } from './core/base45';
import { FrameCollector, toFrames } from './core/frames';
import {
  createIdentity, importTripKey, importVerifyKey, keyId, randomTripKey, sameBytes,
  type Identity, type Peer,
} from './core/crypto';
import {
  decodePairing, encodePairing, kindOf, measure, openUpdate, PackageError, sealUpdate,
  type ErrorCode, type Pairing,
} from './core/codec';
import { drawQr, qrVersion, type Ec } from './platform/qr';
import { engine, startScanner } from './platform/camera';
import { load, save, wipe } from './platform/store';
import { sample } from './sample';

type Bytes = Uint8Array<ArrayBuffer>;

interface LogEntry {
  at: number;
  from: string;
  items: number;
  bytes: number;
  frames: number;
  seconds: number;
}

const ERRORS: Record<ErrorCode, string> = {
  format: '✗ 格式不對，不是這個 App 產生的 QR Code',
  'unknown-author': '✗ 簽章者不在白名單上，已拒絕',
  'bad-signature': '✗ 簽章不符，資料可能被竄改，已拒絕',
  decrypt: '✗ 無法解密：旅程金鑰不同',
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const say = (id: string, text: string) => void ($(id).textContent = text);
const el = (tag: string, text: string) => Object.assign(document.createElement(tag), { textContent: text });

let me: Identity | undefined;
let tripKey: Bytes | undefined;
let peers: Peer[] = [];
let log: LogEntry[] = [];

async function init() {
  [me, tripKey, peers, log] = await Promise.all([
    load<Identity>('identity'),
    load<Bytes>('tripKey'),
    load<Peer[]>('peers').then((p) => p ?? []),
    load<LogEntry[]>('log').then((l) => l ?? []),
  ]);
  $<HTMLTextAreaElement>('send-data').value = JSON.stringify(sample, null, 2);
  bind();
  renderIdentity();
  renderLog();
  await renderStatus();
  if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
}

function bind() {
  $('id-create').onclick = createMe;
  $('id-show').onclick = showPairing;
  $('send-make').onclick = () => makeUpdate(false);
  $('send-tamper').onclick = () => makeUpdate(true);
  $('qr-close').onclick = hideQr;
  $('scan-start').onclick = startScan;
  $('scan-stop').onclick = endScan;
  $('log-wipe').onclick = wipeAll;
  navigator.serviceWorker?.addEventListener('controllerchange', renderStatus);
  document.addEventListener('visibilitychange', () => document.hidden && endScan());
}

// ---- status -------------------------------------------------------------

async function renderStatus() {
  const created = await load<number>('createdAt');
  const standalone =
    matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone;
  const persisted = await navigator.storage?.persist?.().catch(() => false);

  say('st-offline', import.meta.env.DEV ? '開發模式，不快取'
    : navigator.serviceWorker?.controller ? '✓ 已可離線使用' : '尚未就緒：關掉後再開一次');
  say('st-standalone', standalone ? '✓ 主畫面 App' : '瀏覽器分頁（iPhone 請加入主畫面）');
  say('st-persist', persisted ? '✓ 已取得' : '未取得');
  say('st-age', created
    ? `已保存 ${((Date.now() - created) / 86_400_000).toFixed(1)} 天（建立於 ${new Date(created).toLocaleString()}）`
    : '尚未建立資料');
  say('st-engine', engine);
}

// ---- identity & pairing -------------------------------------------------

async function createMe() {
  const name = $<HTMLInputElement>('id-name').value.trim();
  if (!name) return;
  me = await createIdentity(name);
  tripKey = randomTripKey();
  await Promise.all([save('identity', me), save('tripKey', tripKey), save('createdAt', Date.now())]);
  renderIdentity();
  await renderStatus();
}

function renderIdentity() {
  $('id-new').hidden = !!me;
  $('id-ready').hidden = !me;
  if (!me) return;
  say('id-me', me.name);
  say('id-peers', peers.map((p) => p.name).join('、') || '（還沒有）');
}

function showPairing() {
  if (!me || !tripKey) return;
  const text = encodeBase45(encodePairing({ name: me.name, publicKey: me.publicKey, tripKey }));
  showQr(toFrames(text, 2000), `${me.name} 的配對 QR`, 'M');
}

async function pair(p: Pairing) {
  if (!me || !tripKey) return say('scan-result', '請先建立身分');
  if (sameBytes(p.publicKey, me.publicKey)) return say('scan-result', '這是你自己的配對 QR');

  // The first person you pair with decides which trip you are on.
  let note = '';
  if (peers.length === 0) {
    tripKey = p.tripKey;
    await save('tripKey', tripKey);
  } else if (!sameBytes(p.tripKey, tripKey)) {
    note = '（注意：對方的旅程金鑰和你不同，請對方先掃你的配對 QR）';
  }
  peers = [...peers.filter((x) => !sameBytes(x.publicKey, p.publicKey)), { name: p.name, publicKey: p.publicKey }];
  await save('peers', peers);
  renderIdentity();
  say('scan-result', `✓ 已把 ${p.name} 加入白名單${note}`);
}

async function whoIs(id: Uint8Array): Promise<Peer | undefined> {
  for (const p of me ? [me, ...peers] : peers) {
    if (sameBytes(await keyId(p.publicKey), id)) return p;
  }
  return undefined;
}

const findKey = async (id: Bytes) => {
  const p = await whoIs(id);
  return p && importVerifyKey(p.publicKey);
};

// ---- sending ------------------------------------------------------------

async function makeUpdate(tamper: boolean) {
  say('send-error', '');
  if (!me || !tripKey) return say('send-error', '請先建立身分');
  let data: unknown;
  try {
    data = JSON.parse($<HTMLTextAreaElement>('send-data').value);
  } catch {
    return say('send-error', 'JSON 格式錯誤');
  }

  const ec = $<HTMLSelectElement>('send-ec').value as Ec;
  const maxChars = Number($<HTMLInputElement>('send-max').value) || 700;
  const author = { id: await keyId(me.publicKey), key: me.privateKey };
  const sealed = await sealUpdate(data, author, await importTripKey(tripKey));
  if (tamper) sealed[sealed.length - 70] ^= 0xff; // flip one byte inside the ciphertext

  const text = encodeBase45(sealed);
  const frames = toFrames(text, maxChars);
  let version: number;
  try {
    version = Math.max(...frames.map((f) => qrVersion(f, ec)));
  } catch {
    return say('send-error', '每張字元數太多，放不進一張 QR Code');
  }

  const sizes = measure(data);
  renderStats([
    ['原始 JSON', `${sizes.json} bytes`],
    ['壓縮後', `${sizes.compressed} bytes`],
    ['加密＋簽章後', `${sealed.length} bytes`],
    ['QR 文字（base45）', `${text.length} 字元`],
    ['QR Code 張數', `${frames.length} 張`],
    ['最大 QR 版本', `第 ${version} 版（糾錯 ${ec}）`],
  ]);
  showQr(frames, tamper ? '竄改版更新' : '更新', ec);
}

function renderStats(rows: [string, string][]) {
  const table = $('send-stats');
  table.querySelector('tbody')!.replaceChildren(
    ...rows.map(([k, v]) => {
      const tr = document.createElement('tr');
      tr.append(el('th', k), el('td', v));
      return tr;
    }),
  );
  table.hidden = false;
}

let timer: ReturnType<typeof setInterval> | undefined;

function showQr(frames: string[], title: string, ec: Ec) {
  clearInterval(timer);
  const canvas = $<HTMLCanvasElement>('qr-canvas');
  const size = Math.min(innerWidth - 32, 520);
  const interval = Math.max(100, Number($<HTMLInputElement>('send-interval').value) || 300);
  let i = 0;
  const next = () => {
    drawQr(canvas, frames[i], ec, size);
    say('qr-label', frames.length > 1 ? `${title}：第 ${i + 1} / ${frames.length} 張` : title);
    i = (i + 1) % frames.length;
  };
  next();
  if (frames.length > 1) timer = setInterval(next, interval);
  $('display').hidden = false;
  $('display').scrollIntoView({ behavior: 'smooth' });
}

function hideQr() {
  clearInterval(timer);
  $('display').hidden = true;
}

// ---- scanning -----------------------------------------------------------

let stopScan: (() => void) | undefined;

async function startScan() {
  if (stopScan) return;
  hideQr();
  say('scan-result', '');
  say('scan-progress', '對準 QR Code…');
  $('scan-video').hidden = false;

  const collector = new FrameCollector();
  const started = performance.now();
  let last = '';
  try {
    stopScan = await startScanner($<HTMLVideoElement>('scan-video'), (frame) => {
      if (frame === last) return;
      last = frame;
      const progress = collector.add(frame);
      if (!progress) return say('scan-progress', '這不是本 App 的 QR Code');
      say('scan-progress', `已收到 ${progress.received} / ${progress.total} 張`);
      if (progress.text) {
        endScan();
        receive(progress.text, progress.total, (performance.now() - started) / 1000);
      }
    });
  } catch (e) {
    endScan();
    return say('scan-progress', `無法開啟相機：${(e as Error).message}`);
  }
  $('scan-start').hidden = true;
  $('scan-stop').hidden = false;
}

function endScan() {
  stopScan?.();
  stopScan = undefined;
  $('scan-video').hidden = true;
  $('scan-start').hidden = false;
  $('scan-stop').hidden = true;
}

async function receive(text: string, frames: number, seconds: number) {
  try {
    const bytes = decodeBase45(text);
    if (kindOf(bytes) === 'pairing') return await pair(decodePairing(bytes));
    if (!tripKey) return say('scan-result', '請先建立身分並配對');

    const { authorId, data } = await openUpdate(bytes, findKey, await importTripKey(tripKey));
    const from = (await whoIs(authorId))?.name ?? '?';
    const items = (data as { ops?: unknown[] }).ops?.length ?? 0;
    log.push({ at: Date.now(), from, items, bytes: bytes.length, frames, seconds });
    await save('log', log);
    renderLog();
    say('scan-result', `✓ 驗證通過：來自 ${from}，${items} 筆變更，${frames} 張 QR，花了 ${seconds.toFixed(1)} 秒`);
  } catch (e) {
    say('scan-result', e instanceof PackageError ? ERRORS[e.code]
      : e instanceof Error && e.message.startsWith('base45') ? ERRORS.format : `✗ ${e}`);
  }
}

// ---- log ----------------------------------------------------------------

function renderLog() {
  $('log-list').replaceChildren(
    ...log.slice().reverse().map((e) => el('li',
      `${new Date(e.at).toLocaleString()}　來自 ${e.from}：${e.items} 筆、${e.bytes} bytes、` +
      `${e.frames} 張、${e.seconds.toFixed(1)} 秒`)),
  );
}

let armed = false;

async function wipeAll() {
  const button = $('log-wipe');
  if (!armed) {
    armed = true;
    button.textContent = '再按一次確認清除';
    setTimeout(() => {
      armed = false;
      button.textContent = '清除本機所有資料';
    }, 3000);
    return;
  }
  await wipe();
  location.reload();
}

init();
