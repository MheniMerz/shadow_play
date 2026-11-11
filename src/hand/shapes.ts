/**
 * Creature shapes as short lists of soft rules. Each rule maps one feature to
 * a 0..1 score with a smooth ramp between two thresholds; a shape's score is
 * the lowest of its rule scores.
 *
 * Thresholds are starting guesses: tune them with recorded clips
 * (`npm test`) and real hands.
 */
import type { Features } from './features.js';

export type ShapeId = 'rabbit' | 'wolf' | 'duck';
export const SHAPE_IDS: ShapeId[] = ['rabbit', 'wolf', 'duck'];

/**
 * `up`: good when the value is high (score = ramp(v, lo, hi)).
 * `down`: good when the value is low (score = 1 - ramp(v, lo, hi)).
 */
export interface Rule {
  feature: keyof Features;
  dir: 'up' | 'down';
  lo: number;
  hi: number;
  label: string;
}

export interface ShapeDef {
  id: ShapeId;
  name: string;
  hint: string;
  rules: Rule[];
}

export function ramp(v: number, lo: number, hi: number): number {
  if (hi === lo) return v >= hi ? 1 : 0;
  return Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
}

export function ruleScore(rule: Rule, f: Features): number {
  const r = ramp(f[rule.feature], rule.lo, rule.hi);
  return rule.dir === 'up' ? r : 1 - r;
}

const up = (feature: keyof Features, lo: number, hi: number, label: string): Rule => ({
  feature,
  dir: 'up',
  lo,
  hi,
  label,
});
const down = (feature: keyof Features, lo: number, hi: number, label: string): Rule => ({
  feature,
  dir: 'down',
  lo,
  hi,
  label,
});

export const SHAPES: Record<ShapeId, ShapeDef> = {
  rabbit: {
    id: 'rabbit',
    name: 'Rabbit',
    hint: 'Two fingers up for ears, thumb touching your ring finger',
    rules: [
      down('curlIndex', 35, 65, 'index up'),
      down('curlMiddle', 35, 65, 'middle up'),
      up('curlRing', 70, 110, 'ring curled'),
      up('curlPinky', 70, 110, 'pinky curled'),
      down('thumbToRing', 0.025, 0.045, 'thumb touches ring'),
      up('indexMiddleSpread', 3, 7, 'ears apart'),
    ],
  },
  wolf: {
    id: 'wolf',
    name: 'Wolf',
    hint: 'Flat hand, thumb up for the ear. Drop your pinky to howl',
    rules: [
      down('curlIndex', 35, 60, 'index straight'),
      down('curlMiddle', 35, 60, 'middle straight'),
      down('curlRing', 40, 65, 'ring straight'),
      down('indexMiddleSpread', 10, 18, 'fingers together'),
      down('upperSpread', 7, 14, 'hand flat, not spread'),
      down('curlThumb', 40, 70, 'thumb straight'),
      down('thumbForward', 0.35, 0.6, 'thumb up, not forward'),
      up('thumbOut', 0.3, 0.55, 'thumb sticks out'),
    ],
  },
  duck: {
    id: 'duck',
    name: 'Duck',
    hint: 'Fingers together for the top beak, thumb underneath',
    rules: [
      down('curlIndex', 55, 85, 'index mostly straight'),
      down('curlMiddle', 55, 85, 'middle mostly straight'),
      down('curlRing', 60, 90, 'ring mostly straight'),
      down('curlPinky', 65, 95, 'pinky mostly straight'),
      down('fingerSpread', 10, 18, 'fingers together'),
      up('thumbForward', 0.55, 0.8, 'thumb along fingers'),
      down('thumbToMiddle', 0.07, 0.095, 'thumb near fingertips'),
      up('thumbPalmward', 0.02, 0.035, 'thumb under fingers'),
    ],
  },
};

export interface ShapeScore {
  score: number;
  /** Label of the weakest rule, i.e. what to fix. */
  weakest: string;
}

export function scoreShape(def: ShapeDef, f: Features): ShapeScore {
  let score = 1;
  let weakest = '';
  for (const rule of def.rules) {
    const s = ruleScore(rule, f);
    if (s < score) {
      score = s;
      weakest = rule.label;
    }
  }
  return { score, weakest };
}

export type ShapeScores = Record<ShapeId, number>;

export function scoreAll(
  f: Features,
  shapes: Record<ShapeId, ShapeDef> = SHAPES,
  out: ShapeScores = { rabbit: 0, wolf: 0, duck: 0 },
): ShapeScores {
  for (const id of SHAPE_IDS) out[id] = scoreShape(shapes[id], f).score;
  return out;
}

/** Wolf mouth and duck beak: continuous "how open" signals, metres. */
export const GESTURES = {
  wolfMouth: { feature: 'pinkyRingAngle' as const, open: 18, closed: 10 },
  duckBeak: { feature: 'thumbToMiddle' as const, open: 0.06, closed: 0.04 },
};
