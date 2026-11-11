/**
 * Procedural hand poses. Builds 25 WebXR-style joints from a few finger
 * angles. Used for unit tests (before real recordings exist), for the
 * desktop debug hand (keys 1/2/3 in the browser), and for the "ghost hand"
 * that teaches each shape.
 *
 * Hand-local frame: +x radial (thumb side), +y forward (along the fingers),
 * +z dorsal (back of the hand). Palm faces -z. That frame is a left hand;
 * right hands are mirrored in x when placed in the world.
 */
import type { Handedness } from './joints.js';
import { add, cross, normalize, rotateAxis, scale, sub, type V3, v3 } from './vec.js';

export interface FingerPose {
  /** Flexion at knuckle, middle joint, last joint (degrees). */
  mcp: number;
  pip: number;
  dip: number;
  /** Sideways spread, degrees, positive toward the thumb. */
  abd: number;
}

export type ThumbPose =
  | { mode: 'dir'; dir: V3; curl: number }
  | { mode: 'target'; finger: 'index' | 'middle' | 'ring' | 'pinky'; offset: V3 };

export interface HandPoseSpec {
  fingers: Record<'index' | 'middle' | 'ring' | 'pinky', FingerPose>;
  thumb: ThumbPose;
}

type LongFinger = 'index' | 'middle' | 'ring' | 'pinky';
const LONG: LongFinger[] = ['index', 'middle', 'ring', 'pinky'];

// Reference adult right hand, metres.
const META_BASE: Record<LongFinger, V3> = {
  index: [0.012, 0.025, 0],
  middle: [0.002, 0.026, 0],
  ring: [-0.009, 0.024, 0],
  pinky: [-0.018, 0.022, 0],
};
const KNUCKLE: Record<LongFinger, V3> = {
  index: [0.024, 0.092, 0],
  middle: [0.003, 0.095, 0],
  ring: [-0.016, 0.089, 0],
  pinky: [-0.033, 0.078, 0],
};
const BONES: Record<LongFinger, [number, number, number]> = {
  index: [0.04, 0.024, 0.021],
  middle: [0.045, 0.028, 0.023],
  ring: [0.042, 0.027, 0.022],
  pinky: [0.032, 0.02, 0.019],
};
const THUMB_BASE: V3 = [0.022, 0.018, -0.012];
const THUMB_BONES: [number, number, number] = [0.042, 0.032, 0.028];

const DEG = Math.PI / 180;
const X: V3 = [1, 0, 0];
const Z: V3 = [0, 0, 1];
const Y: V3 = [0, 1, 0];

const f = (mcp: number, pip: number, dip: number, abd = 0): FingerPose => ({ mcp, pip, dip, abd });
const straight = (abd = 0) => f(4, 4, 2, abd);
const curled = (abd = 0) => f(75, 95, 55, abd);

/** Ready-made poses. Wolf and duck accept an "open" amount 0..1 for mouth/beak. */
export const POSES = {
  rabbit: (): HandPoseSpec => ({
    fingers: { index: straight(8), middle: straight(-6), ring: curled(), pinky: curled() },
    thumb: { mode: 'target', finger: 'ring', offset: [0.004, -0.004, -0.008] },
  }),
  wolf: (open = 0): HandPoseSpec => ({
    fingers: {
      index: straight(1),
      middle: straight(0),
      ring: straight(-1),
      pinky: f(4 + 50 * open, 4 + 35 * open, 2 + 20 * open, -1 - 14 * open),
    },
    thumb: { mode: 'dir', dir: normalize([0.85, 0.25, 0.35]), curl: 8 },
  }),
  duck: (open = 0): HandPoseSpec => ({
    fingers: { index: f(18, 22, 10, 1), middle: f(18, 22, 10, 0), ring: f(20, 24, 10, -1), pinky: f(22, 26, 12, -2) },
    thumb: { mode: 'target', finger: 'middle', offset: [0.004, -0.012, -0.022 - 0.045 * open] },
  }),
  openHand: (): HandPoseSpec => ({
    fingers: { index: straight(12), middle: straight(0), ring: straight(-12), pinky: straight(-24) },
    thumb: { mode: 'dir', dir: normalize([0.9, 0.4, -0.1]), curl: 10 },
  }),
  relaxed: (): HandPoseSpec => ({
    fingers: { index: f(20, 30, 15, 6), middle: f(25, 35, 15, 0), ring: f(30, 40, 18, -6), pinky: f(35, 45, 20, -12) },
    thumb: { mode: 'dir', dir: normalize([0.6, 0.7, -0.3]), curl: 20 },
  }),
  fist: (): HandPoseSpec => ({
    fingers: { index: curled(), middle: curled(), ring: curled(), pinky: curled() },
    thumb: { mode: 'target', finger: 'middle', offset: [0.0, -0.025, -0.02] },
  }),
  peace: (): HandPoseSpec => ({
    fingers: { index: straight(12), middle: straight(-10), ring: curled(), pinky: curled() },
    // thumb resting across the curled fingers' middle segments, not on the ring tip
    thumb: { mode: 'target', finger: 'ring', offset: [0.0, 0.035, -0.035] },
  }),
  point: (): HandPoseSpec => ({
    fingers: { index: straight(0), middle: curled(), ring: curled(), pinky: curled() },
    thumb: { mode: 'target', finger: 'middle', offset: [0.0, 0.02, -0.02] },
  }),
  /** Rabbit ears up, but thumb sticking out instead of closing the loop. */
  rabbitNoThumb: (): HandPoseSpec => ({
    fingers: { index: straight(8), middle: straight(-6), ring: curled(), pinky: curled() },
    thumb: { mode: 'dir', dir: normalize([0.9, 0.35, 0.1]), curl: 10 },
  }),
  /** Flat hand, fingers together, thumb tucked forward against the index: not a wolf. */
  flatThumbIn: (): HandPoseSpec => ({
    fingers: { index: straight(1), middle: straight(0), ring: straight(-1), pinky: straight(-2) },
    thumb: { mode: 'dir', dir: normalize([0.2, 0.95, -0.15]), curl: 6 },
  }),
  thumbsUp: (): HandPoseSpec => ({
    fingers: { index: curled(), middle: curled(), ring: curled(), pinky: curled() },
    thumb: { mode: 'dir', dir: normalize([0.5, 0.1, 0.85]), curl: 5 },
  }),
} as const;

export type PoseName = keyof typeof POSES;

export interface SynthOptions {
  handedness?: Handedness;
  /** World position of the wrist. */
  position?: V3;
  /** World rotation of the hand frame, quaternion [x, y, z, w]. */
  rotation?: [number, number, number, number];
  /** Uniform hand scale (1 = reference adult hand). */
  size?: number;
  /** Gaussian joint noise, metres (standard deviation). */
  noise?: number;
  rng?: () => number;
}

/** Deterministic PRNG for repeatable tests. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rng: () => number): number {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function quatRotate(q: [number, number, number, number], v: V3, out: V3 = v3()): V3 {
  const [qx, qy, qz, qw] = q;
  const [x, y, z] = v;
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  out[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  out[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  out[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  return out;
}

export function quatFromAxisAngle(axis: V3, angle: number): [number, number, number, number] {
  const n = normalize(axis);
  const s = Math.sin(angle / 2);
  return [n[0] * s, n[1] * s, n[2] * s, Math.cos(angle / 2)];
}

export function quatMultiply(
  a: [number, number, number, number],
  b: [number, number, number, number],
): [number, number, number, number] {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** Build the 25 joints of a pose in hand-local space (right hand). */
export function localJoints(spec: HandPoseSpec): V3[] {
  const j: V3[] = Array.from({ length: 25 }, () => v3());
  j[0] = [0, 0, 0];
  const tips: Record<LongFinger, V3> = {} as Record<LongFinger, V3>;

  LONG.forEach((name, fi) => {
    const pose = spec.fingers[name];
    const base = 5 + fi * 5;
    j[base] = [...META_BASE[name]];
    j[base + 1] = [...KNUCKLE[name]];
    const lateral = rotateAxis(X, Z, pose.abd * DEG);
    let dir = rotateAxis(Y, Z, pose.abd * DEG);
    const flex = [pose.mcp, pose.pip, pose.dip];
    let pos = j[base + 1];
    for (let k = 0; k < 3; k++) {
      dir = normalize(rotateAxis(dir, lateral, -flex[k] * DEG));
      pos = add(pos, scale(dir, BONES[name][k]));
      j[base + 2 + k] = pos;
    }
    tips[name] = j[base + 4];
  });

  j[1] = [...THUMB_BASE];
  const t = spec.thumb;
  if (t.mode === 'dir') {
    let dir = normalize(t.dir);
    // bend axis: perpendicular to dir, roughly toward the palm
    const bendAxis = normalize(cross(dir, [0, 0, -1]));
    let pos = j[1];
    for (let k = 0; k < 3; k++) {
      pos = add(pos, scale(dir, THUMB_BONES[k]));
      j[2 + k] = pos;
      dir = normalize(rotateAxis(dir, bendAxis, -t.curl * DEG));
    }
  } else {
    const target = add(tips[t.finger], t.offset);
    const total = sub(target, j[1]);
    const bulge: V3 = [0.012, 0, -0.004];
    j[2] = add(add(j[1], scale(total, 0.42)), bulge);
    j[3] = add(add(j[1], scale(total, 0.74)), scale(bulge, 0.6));
    j[4] = target;
  }
  return j;
}

/** Build world-space joints (flat xyz Float32Array of 75) for a pose. */
export function synthHand(spec: HandPoseSpec, opts: SynthOptions = {}): Float32Array {
  const {
    handedness = 'right',
    position = [0, 0, 0],
    rotation = [0, 0, 0, 1],
    size = 1,
    noise = 0,
    rng = Math.random,
  } = opts;
  const local = localJoints(spec);
  const out = new Float32Array(75);
  const tmp = v3();
  for (let i = 0; i < 25; i++) {
    const p = local[i];
    tmp[0] = (handedness === 'right' ? -p[0] : p[0]) * size;
    tmp[1] = p[1] * size;
    tmp[2] = p[2] * size;
    quatRotate(rotation, tmp, tmp);
    out[i * 3] = tmp[0] + position[0] + (noise ? gauss(rng) * noise : 0);
    out[i * 3 + 1] = tmp[1] + position[1] + (noise ? gauss(rng) * noise : 0);
    out[i * 3 + 2] = tmp[2] + position[2] + (noise ? gauss(rng) * noise : 0);
  }
  return out;
}

/** Blend two poses' finger angles (thumb taken from whichever is closer). */
export function blendPoses(a: HandPoseSpec, b: HandPoseSpec, t: number): HandPoseSpec {
  const lerp = (x: number, y: number) => x + (y - x) * t;
  const fingers = {} as HandPoseSpec['fingers'];
  for (const n of LONG) {
    const fa = a.fingers[n];
    const fb = b.fingers[n];
    fingers[n] = { mcp: lerp(fa.mcp, fb.mcp), pip: lerp(fa.pip, fb.pip), dip: lerp(fa.dip, fb.dip), abd: lerp(fa.abd, fb.abd) };
  }
  return { fingers, thumb: t < 0.5 ? a.thumb : b.thumb };
}
