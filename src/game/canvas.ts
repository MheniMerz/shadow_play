/**
 * Canvas-drawn textures: paper grain and one-line text labels. Everything is
 * generated at runtime so the game ships with no image assets.
 */
import { CanvasTexture, LinearFilter, SRGBColorSpace } from '@iwsdk/core';

function mulberry(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Warm paper with fibres and a soft vignette. */
export function paperTexture(w = 1024, h = 744, seed = 3): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const rnd = mulberry(seed);
  g.fillStyle = '#f3e7d3';
  g.fillRect(0, 0, w, h);
  // blotches
  for (let i = 0; i < 90; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 30 + rnd() * 140;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.025 + rnd() * 0.035;
    grad.addColorStop(0, `rgba(190,160,120,${a})`);
    grad.addColorStop(1, 'rgba(190,160,120,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // fibres
  g.lineCap = 'round';
  for (let i = 0; i < 1400; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const len = 4 + rnd() * 22;
    const ang = rnd() * Math.PI * 2;
    g.strokeStyle = `rgba(${120 + rnd() * 60},${100 + rnd() * 50},${70 + rnd() * 40},${0.05 + rnd() * 0.08})`;
    g.lineWidth = 0.5 + rnd();
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(ang + 0.6) * len * 0.5, y + Math.sin(ang + 0.6) * len * 0.5, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    g.stroke();
  }
  // vignette
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.7);
  v.addColorStop(0, 'rgba(120,80,40,0)');
  v.addColorStop(1, 'rgba(120,80,40,0.18)');
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export interface TextOptions {
  font?: string;
  color?: string;
  background?: string | null;
  align?: CanvasTextAlign;
  padding?: number;
}

/**
 * A reusable canvas text label. Call `set(text)` to redraw; the texture
 * updates in place so materials keep working.
 */
export class TextCanvas {
  readonly canvas: HTMLCanvasElement;
  readonly texture: CanvasTexture;
  private readonly g: CanvasRenderingContext2D;
  private last = '';
  constructor(
    readonly width: number,
    readonly height: number,
    private opts: TextOptions = {},
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.g = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
  }

  setOptions(opts: TextOptions): void {
    this.opts = { ...this.opts, ...opts };
    this.last = '\u0000';
  }

  /** Draw one or more lines (split on \n). */
  set(text: string): void {
    if (text === this.last) return;
    this.last = text;
    const { g, width, height } = this;
    const { font = '600 44px Georgia, serif', color = '#2a211b', background = null, align = 'center', padding = 16 } = this.opts;
    g.clearRect(0, 0, width, height);
    if (background) {
      g.fillStyle = background;
      const r = 24;
      g.beginPath();
      g.roundRect(2, 2, width - 4, height - 4, r);
      g.fill();
    }
    g.font = font;
    g.fillStyle = color;
    g.textAlign = align;
    g.textBaseline = 'middle';
    const lines = text.split('\n');
    const size = parseInt(/(\d+)px/.exec(font)?.[1] ?? '40', 10);
    const lh = size * 1.25;
    const x = align === 'left' ? padding : align === 'right' ? width - padding : width / 2;
    let y = height / 2 - ((lines.length - 1) * lh) / 2;
    for (const line of lines) {
      g.fillText(line, x, y, width - padding * 2);
      y += lh;
    }
    this.texture.needsUpdate = true;
  }

  /** Direct access for custom drawing (debug overlay); call `commit()` after. */
  get ctx(): CanvasRenderingContext2D {
    return this.g;
  }

  commit(): void {
    this.last = '\u0000';
    this.texture.needsUpdate = true;
  }
}
