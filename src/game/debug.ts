/**
 * Developer overlay: live features, shape scores and the weakest rule, plus
 * a clip recorder. Recorded clips are POSTed to the dev server (saved under
 * recordings/) or downloaded, then replayed by `npm test`.
 */
import { Mesh, MeshBasicMaterial, PlaneGeometry } from '@iwsdk/core';
import { type ClipFrame, type HandClip, packJoints } from '../hand/clip.js';
import { FEATURE_KEYS, type Features } from '../hand/features.js';
import type { Handedness } from '../hand/joints.js';
import { SHAPE_IDS, type ShapeDef, type ShapeId, scoreShape } from '../hand/shapes.js';
import { TextCanvas } from './canvas.js';

export const CLIP_LABELS: { label: string; expect: ShapeId | null }[] = [
  { label: 'rabbit', expect: 'rabbit' },
  { label: 'wolf', expect: 'wolf' },
  { label: 'wolf-howl', expect: 'wolf' },
  { label: 'duck', expect: 'duck' },
  { label: 'duck-paddle', expect: 'duck' },
  { label: 'near-miss-rabbit', expect: null },
  { label: 'near-miss-wolf', expect: null },
  { label: 'near-miss-duck', expect: null },
  { label: 'open-hand', expect: null },
  { label: 'relaxed', expect: null },
];

export class DebugOverlay {
  readonly text = new TextCanvas(640, 760);
  readonly mesh: Mesh;
  labelIndex = 0;
  private recording: { clip: HandClip; until: number; start: number } | null = null;
  private status = '';
  private fps = 72;

  constructor() {
    this.mesh = new Mesh(new PlaneGeometry(0.2, 0.2375), new MeshBasicMaterial({ map: this.text.texture, transparent: true, depthWrite: false }));
    this.mesh.name = 'debug-overlay';
    this.mesh.renderOrder = 4;
  }

  get label() {
    return CLIP_LABELS[this.labelIndex];
  }

  cycleLabel(): void {
    this.labelIndex = (this.labelIndex + 1) % CLIP_LABELS.length;
  }

  get isRecording(): boolean {
    return this.recording != null;
  }

  /** Start a 3 s recording, after a 1 s countdown handled by the caller's clock. */
  startRecording(now: number, handedness: Handedness): void {
    const { label, expect } = this.label;
    this.recording = {
      clip: { version: 1, label, expect, handedness, recordedAt: new Date().toISOString(), frames: [] },
      start: now,
      until: now + 3000,
    };
    this.status = `recording ${label}…`;
  }

  /** Feed a frame while recording. Returns the finished clip when done. */
  record(now: number, joints: Float32Array | null): HandClip | null {
    const r = this.recording;
    if (!r) return null;
    const fr: ClipFrame = { t: Math.round(now - r.start), j: joints ? packJoints(joints) : null };
    r.clip.frames.push(fr);
    if (now >= r.until) {
      this.recording = null;
      return r.clip;
    }
    return null;
  }

  setStatus(s: string): void {
    this.status = s;
  }

  draw(opts: {
    dt: number;
    source: string;
    handedness: Handedness | null;
    features: Features | null;
    shapes: Record<ShapeId, ShapeDef>;
    active: ShapeId | null;
    needed: ShapeId | null;
    ratio: number;
    calibrated: string;
  }): void {
    this.fps = this.fps * 0.95 + (1 / Math.max(opts.dt, 1e-3)) * 0.05;
    const g = this.text.ctx;
    const W = 640;
    g.clearRect(0, 0, W, 760);
    g.fillStyle = 'rgba(20,16,12,0.82)';
    g.beginPath();
    g.roundRect(0, 0, W, 760, 18);
    g.fill();
    g.fillStyle = '#ffd9a0';
    g.font = '600 26px monospace';
    g.textAlign = 'left';
    g.textBaseline = 'top';
    let y = 12;
    const line = (s: string, color = '#f5e9d8') => {
      g.fillStyle = color;
      g.fillText(s, 14, y);
      y += 30;
    };
    line(`fps ${this.fps.toFixed(0)}  hand ${opts.handedness ?? '-'} (${opts.source})  ratio ${opts.ratio.toFixed(2)}`, '#ffd9a0');
    line(`active ${opts.active ?? '-'}   need ${opts.needed ?? '-'}   calib ${opts.calibrated}`, '#ffd9a0');
    const f = opts.features;
    if (f) {
      g.font = '22px monospace';
      for (let i = 0; i < FEATURE_KEYS.length; i += 2) {
        const a = FEATURE_KEYS[i];
        const b = FEATURE_KEYS[i + 1];
        const fmt = (k: keyof Features) => `${k.padEnd(17)}${f[k].toFixed(k.startsWith('curl') || k.includes('Spread') || k.includes('Angle') ? 0 : 3).padStart(6)}`;
        g.fillStyle = '#e8dccb';
        g.fillText(fmt(a) + (b ? '  ' + fmt(b) : ''), 14, y);
        y += 26;
      }
      y += 8;
      g.font = '600 26px monospace';
      for (const id of SHAPE_IDS) {
        const s = scoreShape(opts.shapes[id], f);
        g.fillStyle = '#5a4a3a';
        g.fillRect(150, y + 4, 300, 20);
        g.fillStyle = s.score > 0.8 ? '#ffb347' : s.score > 0.6 ? '#c9a06a' : '#8f8a84';
        g.fillRect(150, y + 4, 300 * s.score, 20);
        g.fillStyle = id === opts.active ? '#ffb347' : '#f5e9d8';
        g.fillText(id, 14, y);
        g.font = '20px monospace';
        g.fillStyle = '#d8c8b0';
        g.fillText(s.score < 0.8 ? s.weakest : '', 460, y + 3);
        g.font = '600 26px monospace';
        y += 32;
      }
    } else {
      line('no hand tracked');
    }
    y = 760 - 70;
    g.fillStyle = this.recording ? '#ff6b5a' : '#ffd9a0';
    g.fillText(`clip: ${this.label.label}  (expect ${this.label.expect ?? 'none'})`, 14, y);
    g.fillStyle = '#e8dccb';
    g.fillText(this.status, 14, y + 32);
    this.text.commit();
  }
}

/** Save a clip: POST to the dev server, fall back to a browser download. */
export async function saveClip(clip: HandClip): Promise<string> {
  const name = `${clip.label}-${clip.recordedAt.replace(/[:.]/g, '-')}.json`;
  const body = JSON.stringify(clip);
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}__clips`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    if (res.ok) return `saved recordings/${(await res.json()).file ?? name}`;
  } catch {
    /* not on the dev server */
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  a.download = name;
  a.click();
  return `downloaded ${name}`;
}
