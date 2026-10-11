// The album art's colour for the music wave, the way the iPhone tints it: the
// cover's most vivid hue, softened and lifted so it reads on the black pill.
// A black-and-white cover gives a soft grey.

/** Pixels (RGBA, as a canvas gives them) to a CSS colour. */
export function pickColor(px: ArrayLike<number>): string {
  // Hue buckets weighted by how vivid each pixel is, so a small bright subject
  // beats a large dull background; near-black and near-white pixels don't vote.
  const BUCKETS = 24;
  const weight = new Array<number>(BUCKETS).fill(0);
  const sum = Array.from({ length: BUCKETS }, () => [0, 0, 0]);
  let vivid = 0;
  let total = 0;
  for (let i = 0; i + 3 < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    const [h, s, l] = hsl(px[i], px[i + 1], px[i + 2]);
    total++;
    if (l < 0.12 || l > 0.92 || s < 0.18) continue;
    const w = s * (1 - Math.abs(l - 0.5) * 1.4);
    const b = Math.floor(h * BUCKETS) % BUCKETS;
    weight[b] += w;
    sum[b][0] += px[i] * w;
    sum[b][1] += px[i + 1] * w;
    sum[b][2] += px[i + 2] * w;
    vivid++;
  }
  // Mostly grey: a soft grey wave.
  if (!total || vivid / total < 0.06) return 'rgb(176, 176, 176)';
  let best = 0;
  for (let b = 1; b < BUCKETS; b++) if (weight[b] > weight[best]) best = b;
  const w = weight[best];
  const [h, s] = hsl(sum[best][0] / w, sum[best][1] / w, sum[best][2] / w);
  // Muted and light enough for a black pill, like the iPhone's.
  const [r, g, bl] = rgb(h, Math.min(0.62, Math.max(0.3, s)), 0.62);
  return `rgb(${r}, ${g}, ${bl})`;
}

function hsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}

function rgb(h: number, s: number, l: number): [number, number, number] {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [ch(h + 1 / 3), ch(h), ch(h - 1 / 3)].map((v) => Math.round(v * 255)) as [number, number, number];
}

const cache = new Map<string, string | null>();

/** The cover's colour, or null until it has loaded (or if it can't be read). */
export function artColor(src: string | null, onReady: () => void): string | null {
  if (!src) return null;
  if (cache.has(src)) return cache.get(src) ?? null;
  cache.set(src, null);
  if (cache.size > 20) cache.delete(cache.keys().next().value!);
  const img = new Image();
  img.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 32;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(img, 0, 0, 32, 32);
      cache.set(src, pickColor(g.getImageData(0, 0, 32, 32).data));
      onReady();
    } catch {
      /* unreadable image: keep the default colour */
    }
  };
  img.src = src;
  return null;
}
