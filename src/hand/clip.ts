/**
 * Recorded hand clips: a few seconds of joint data captured on the headset
 * (debug mode) and replayed in Node tests, so threshold changes can be
 * checked away from the headset.
 */
import { computeFeatures, emptyFeatures } from './features.js';
import type { Handedness } from './joints.js';
import { GESTURES, type ShapeDef, type ShapeId } from './shapes.js';
import {
  OpenCloseTracker,
  type ShapeEvent,
  ShapeStabilizer,
  type StabilizerOptions,
} from './stabilizer.js';

export interface ClipFrame {
  /** ms since clip start */
  t: number;
  /** 75 numbers (25 joints × xyz, metres) or null when the hand was not tracked. */
  j: number[] | null;
}

export interface HandClip {
  version: 1;
  /** What the player was asked to do, e.g. "rabbit", "wolf-howl", "near-miss-rabbit". */
  label: string;
  /** Shape that should be recognised, or null if none should trigger. */
  expect: ShapeId | null;
  handedness: Handedness;
  recordedAt: string;
  note?: string;
  frames: ClipFrame[];
}

export interface ReplayResult {
  events: ShapeEvent[];
  /** ms from clip start to the first 'enter' of the expected shape (null if never). */
  firstEnterMs: number | null;
  /** Shapes that were entered at any point. */
  entered: Set<ShapeId>;
  howls: number;
  paddles: number;
  maxScores: Record<ShapeId, number>;
}

export function replayClip(
  clip: HandClip,
  shapes?: Record<ShapeId, ShapeDef>,
  opts?: Partial<StabilizerOptions>,
): ReplayResult {
  const stab = new ShapeStabilizer(opts, shapes);
  const f = emptyFeatures();
  const events: ShapeEvent[] = [];
  const mouth = new OpenCloseTracker(GESTURES.wolfMouth.open, GESTURES.wolfMouth.closed);
  const beak = new OpenCloseTracker(GESTURES.duckBeak.open, GESTURES.duckBeak.closed);
  const maxScores: Record<ShapeId, number> = { rabbit: 0, wolf: 0, duck: 0 };
  let howls = 0;
  let paddles = 0;
  for (const fr of clip.frames) {
    if (fr.j) computeFeatures(fr.j, clip.handedness, f);
    stab.update(fr.j ? f : null, fr.t, events);
    for (const id of Object.keys(maxScores) as ShapeId[]) {
      maxScores[id] = Math.max(maxScores[id], stab.scores[id]);
    }
    const sm = stab.smoothed;
    if (sm && stab.active === 'wolf') {
      if (mouth.update(sm[GESTURES.wolfMouth.feature]) === 'open') howls++;
    } else mouth.reset();
    if (sm && stab.active === 'duck') {
      if (beak.update(sm[GESTURES.duckBeak.feature]) === 'close') paddles++;
    } else beak.reset();
  }
  const entered = new Set(events.filter((e) => e.type === 'enter').map((e) => e.shape));
  const first = events.find((e) => e.type === 'enter' && e.shape === clip.expect);
  return {
    events,
    firstEnterMs: first ? first.t - (clip.frames[0]?.t ?? 0) : null,
    entered,
    howls,
    paddles,
    maxScores,
  };
}

/** Round joint data so clips stay small (0.1 mm precision). */
export function packJoints(j: ArrayLike<number>): number[] {
  const out = new Array<number>(j.length);
  for (let i = 0; i < j.length; i++) out[i] = Math.round(j[i] * 10000) / 10000;
  return out;
}
