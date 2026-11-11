/**
 * Turns 25 hand joints into a dozen numbers that describe the hand's shape.
 * Pure function, no rendering code: runs in Node tests and on the headset.
 */
import { FINGER_CHAINS, type FingerName, type Handedness, J } from './joints.js';
import {
  angleDeg,
  cross,
  distance,
  dot,
  normalize,
  readJoint,
  scale,
  sub,
  type V3,
  v3,
} from './vec.js';

export interface Features {
  /** Finger curl, degrees: ~0 straight, 150+ fully curled (thumb: sum of its two joint angles). */
  curlThumb: number;
  curlIndex: number;
  curlMiddle: number;
  curlRing: number;
  curlPinky: number;
  /** Fingertip distances, metres. */
  thumbToRing: number;
  thumbToMiddle: number;
  thumbToIndex: number;
  /** Angle between index and middle finger directions, degrees. */
  indexMiddleSpread: number;
  /** Mean angle between adjacent long fingers (index-middle, middle-ring, ring-pinky). */
  fingerSpread: number;
  /** Mean angle index-middle and middle-ring (ignores the pinky). */
  upperSpread: number;
  /** Distance from pinky tip to ring tip, metres. */
  pinkyDrop: number;
  /** Angle between pinky and ring finger directions, degrees (wolf mouth). */
  pinkyRingAngle: number;
  /** Thumb direction · hand forward (wrist → middle knuckle). 1 = thumb points along fingers. */
  thumbForward: number;
  /** Thumb direction · radial axis (toward index side). 1 = thumb sticks out sideways / up as an ear. */
  thumbOut: number;
  /** How far the thumb tip sits on the palm side of the knuckles, metres (duck's lower beak). */
  thumbPalmward: number;
  /** Hand size: wrist → middle knuckle, metres. Used to normalise distances. */
  handSize: number;
}

export const FEATURE_KEYS: (keyof Features)[] = [
  'curlThumb',
  'curlIndex',
  'curlMiddle',
  'curlRing',
  'curlPinky',
  'thumbToRing',
  'thumbToMiddle',
  'thumbToIndex',
  'indexMiddleSpread',
  'fingerSpread',
  'upperSpread',
  'pinkyDrop',
  'pinkyRingAngle',
  'thumbForward',
  'thumbOut',
  'thumbPalmward',
  'handSize',
];

export function emptyFeatures(): Features {
  return {
    curlThumb: 0,
    curlIndex: 0,
    curlMiddle: 0,
    curlRing: 0,
    curlPinky: 0,
    thumbToRing: 0,
    thumbToMiddle: 0,
    thumbToIndex: 0,
    indexMiddleSpread: 0,
    fingerSpread: 0,
    upperSpread: 0,
    pinkyDrop: 0,
    pinkyRingAngle: 0,
    thumbForward: 0,
    thumbOut: 0,
    thumbPalmward: 0,
    handSize: 0,
  };
}

/** Reference adult hand size (wrist → middle knuckle). Distances are rescaled to it. */
export const REFERENCE_HAND_SIZE = 0.095;

// Scratch vectors, reused every call.
const a = v3();
const b = v3();
const c = v3();
const d1 = v3();
const d2 = v3();
const fwd = v3();
const side = v3();
const nrm = v3();
const tmp = v3();
const p: V3[] = Array.from({ length: 25 }, () => v3());

/**
 * Long-finger curl: angle between the metacarpal (wrist-side bone, fixed in
 * the palm) and the chord from the knuckle to the fingertip. About 0° for a
 * straight finger, 150° and up when fully curled. Using long segments keeps
 * it steady under joint jitter.
 */
function fingerCurl(chain: number[]): number {
  sub(p[chain[1]], p[chain[0]], d1);
  sub(p[chain[4]], p[chain[1]], d2);
  return angleDeg(d1, d2);
}

function fingerDir(f: FingerName, out: V3): V3 {
  const ch = FINGER_CHAINS[f];
  // knuckle (proximal joint) → tip
  return sub(p[ch[ch.length - 1]], p[ch[1]], out);
}

/**
 * Extract features from 25 joint positions (flat xyz array).
 * `handedness` fixes the sign of the radial axis so left and right hands
 * produce the same numbers for the same shape.
 */
export function computeFeatures(
  joints: ArrayLike<number>,
  handedness: Handedness,
  out: Features = emptyFeatures(),
): Features {
  for (let i = 0; i < 25; i++) readJoint(joints, i, p[i]);

  const handSize = distance(p[J.wrist], p[J.middleProx]) || REFERENCE_HAND_SIZE;
  const k = REFERENCE_HAND_SIZE / handSize; // scale distances to a reference hand

  // Thumb: metacarpal vs the chord from its first knuckle to the tip.
  sub(p[J.thumbProx], p[J.thumbMeta], d1);
  sub(p[J.thumbTip], p[J.thumbProx], d2);
  out.curlThumb = angleDeg(d1, d2);
  out.curlIndex = fingerCurl(FINGER_CHAINS.index);
  out.curlMiddle = fingerCurl(FINGER_CHAINS.middle);
  out.curlRing = fingerCurl(FINGER_CHAINS.ring);
  out.curlPinky = fingerCurl(FINGER_CHAINS.pinky);

  out.thumbToRing = distance(p[J.thumbTip], p[J.ringTip]) * k;
  out.thumbToMiddle = distance(p[J.thumbTip], p[J.middleTip]) * k;
  out.thumbToIndex = distance(p[J.thumbTip], p[J.indexTip]) * k;
  out.pinkyDrop = distance(p[J.pinkyTip], p[J.ringTip]) * k;

  fingerDir('index', a);
  fingerDir('middle', b);
  out.indexMiddleSpread = angleDeg(a, b);
  fingerDir('ring', c);
  const s1 = out.indexMiddleSpread;
  const s2 = angleDeg(b, c);
  fingerDir('pinky', tmp);
  const s3 = angleDeg(c, tmp);
  out.pinkyRingAngle = s3;
  out.fingerSpread = (s1 + s2 + s3) / 3;
  out.upperSpread = (s1 + s2) / 2;

  // Hand frame: forward = wrist → middle knuckle, radial = pinky knuckle → index knuckle.
  normalize(sub(p[J.middleProx], p[J.wrist], fwd), fwd);
  sub(p[J.indexProx], p[J.pinkyProx], side);
  // Orthogonalise radial against forward.
  const proj = dot(side, fwd);
  side[0] -= fwd[0] * proj;
  side[1] -= fwd[1] * proj;
  side[2] -= fwd[2] * proj;
  normalize(side, side);
  // Palm normal (out of the palm) for either hand.
  cross(side, fwd, nrm);
  if (handedness === 'left') scale(nrm, -1, nrm);

  normalize(sub(p[J.thumbTip], p[J.thumbProx], tmp), tmp);
  out.thumbForward = dot(tmp, fwd);
  out.thumbOut = dot(tmp, side);
  sub(p[J.thumbTip], p[J.middleProx], tmp);
  out.thumbPalmward = dot(tmp, nrm) * k;
  out.handSize = handSize;
  return out;
}

/**
 * Palm normal pointing out of the palm (not the back of the hand), for any
 * handedness. Returned in `out`.
 */
export function palmNormal(
  joints: ArrayLike<number>,
  handedness: Handedness,
  out: V3 = v3(),
): V3 {
  const w = readJoint(joints, J.wrist, v3());
  const m = readJoint(joints, J.middleProx, v3());
  const i = readJoint(joints, J.indexProx, v3());
  const pk = readJoint(joints, J.pinkyProx, v3());
  const f = normalize(sub(m, w));
  const s = normalize(sub(i, pk));
  cross(s, f, out);
  if (handedness === 'left') {
    out[0] = -out[0];
    out[1] = -out[1];
    out[2] = -out[2];
  }
  return normalize(out, out);
}

/** Mean of the 25 joints, a stable "where is the hand" point. */
export function handCentroid(joints: ArrayLike<number>, out: V3 = v3()): V3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < 25; i++) {
    x += joints[i * 3];
    y += joints[i * 3 + 1];
    z += joints[i * 3 + 2];
  }
  out[0] = x / 25;
  out[1] = y / 25;
  out[2] = z / 25;
  return out;
}
