import jsQR from 'jsqr';

// The browser's own BarcodeDetector where it exists (Android Chrome); jsQR everywhere else (iPhone).
interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type DetectorClass = new (options: { formats: string[] }) => Detector;
const Native = (globalThis as { BarcodeDetector?: DetectorClass }).BarcodeDetector;

export const engine = Native ? '系統內建 BarcodeDetector' : 'jsQR';

/** Starts the back camera and reports every QR text it sees. Returns a stop function. */
export async function startScanner(
  video: HTMLVideoElement,
  onText: (text: string) => void,
): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1280 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();

  const detector = Native ? new Native({ formats: ['qr_code'] }) : undefined;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  let running = true;

  const tick = async () => {
    if (!running) return;
    if (video.readyState >= video.HAVE_CURRENT_DATA) {
      try {
        if (detector) {
          for (const code of await detector.detect(video)) onText(code.rawValue);
        } else {
          const scale = Math.min(1, 960 / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
          if (code) onText(code.data);
        }
      } catch {
        // a bad frame is not worth stopping for
      }
    }
    requestAnimationFrame(tick);
  };
  tick();

  return () => {
    running = false;
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
}
