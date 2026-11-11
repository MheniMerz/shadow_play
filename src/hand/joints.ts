/**
 * WebXR hand joint layout: 25 joints per hand, always in this order
 * (https://www.w3.org/TR/webxr-hand-input-1/#skeleton-joints-section).
 */

export const JOINT_NAMES = [
  'wrist',
  'thumb-metacarpal',
  'thumb-phalanx-proximal',
  'thumb-phalanx-distal',
  'thumb-tip',
  'index-finger-metacarpal',
  'index-finger-phalanx-proximal',
  'index-finger-phalanx-intermediate',
  'index-finger-phalanx-distal',
  'index-finger-tip',
  'middle-finger-metacarpal',
  'middle-finger-phalanx-proximal',
  'middle-finger-phalanx-intermediate',
  'middle-finger-phalanx-distal',
  'middle-finger-tip',
  'ring-finger-metacarpal',
  'ring-finger-phalanx-proximal',
  'ring-finger-phalanx-intermediate',
  'ring-finger-phalanx-distal',
  'ring-finger-tip',
  'pinky-finger-metacarpal',
  'pinky-finger-phalanx-proximal',
  'pinky-finger-phalanx-intermediate',
  'pinky-finger-phalanx-distal',
  'pinky-finger-tip',
] as const;

export type JointName = (typeof JOINT_NAMES)[number];
export const JOINT_COUNT = 25;

export const J = {
  wrist: 0,
  thumbMeta: 1,
  thumbProx: 2,
  thumbDist: 3,
  thumbTip: 4,
  indexMeta: 5,
  indexProx: 6,
  indexInter: 7,
  indexDist: 8,
  indexTip: 9,
  middleMeta: 10,
  middleProx: 11,
  middleInter: 12,
  middleDist: 13,
  middleTip: 14,
  ringMeta: 15,
  ringProx: 16,
  ringInter: 17,
  ringDist: 18,
  ringTip: 19,
  pinkyMeta: 20,
  pinkyProx: 21,
  pinkyInter: 22,
  pinkyDist: 23,
  pinkyTip: 24,
} as const;

export type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
export const FINGERS: FingerName[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];

/** First joint index of each finger chain (metacarpal), 5 joints per chain except the thumb (4). */
export const FINGER_CHAINS: Record<FingerName, number[]> = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8, 9],
  middle: [10, 11, 12, 13, 14],
  ring: [15, 16, 17, 18, 19],
  pinky: [20, 21, 22, 23, 24],
};

export type Handedness = 'left' | 'right';

/**
 * One frame of hand data: 25 joint positions in metres (world or any
 * consistent space), flattened xyz.
 */
export interface HandFrame {
  /** Milliseconds, monotonic within a clip. */
  t: number;
  handedness: Handedness;
  joints: Float32Array | number[];
}
