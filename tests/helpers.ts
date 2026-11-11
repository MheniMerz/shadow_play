import type { ClipFrame, HandClip } from '../src/hand/clip.js';
import type { Handedness } from '../src/hand/joints.js';
import type { ShapeId } from '../src/hand/shapes.js';
import {
  type HandPoseSpec,
  mulberry32,
  quatFromAxisAngle,
  quatMultiply,
  synthHand,
} from '../src/hand/synthetic.js';
import type { V3 } from '../src/hand/vec.js';

export type Quat = [number, number, number, number];

export function randomRotation(rng: () => number): Quat {
  // Random but plausible: the hand roughly in front of the player, any roll.
  const yaw = quatFromAxisAngle([0, 1, 0], (rng() - 0.5) * Math.PI);
  const pitch = quatFromAxisAngle([1, 0, 0], (rng() - 0.5) * Math.PI * 0.8);
  const roll = quatFromAxisAngle([0, 0, 1], rng() * Math.PI * 2);
  return quatMultiply(quatMultiply(yaw, pitch), roll);
}

/** Build a synthetic clip: a list of [durationMs, pose|null] segments at `fps`. */
export function synthClip(
  segments: [number, HandPoseSpec | ((t: number) => HandPoseSpec) | null][],
  opts: { expect: ShapeId | null; label?: string; handedness?: Handedness; seed?: number; noise?: number; fps?: number; rotation?: Quat; position?: V3; size?: number },
): HandClip {
  const fps = opts.fps ?? 72;
  const rng = mulberry32(opts.seed ?? 1);
  const rotation = opts.rotation ?? randomRotation(rng);
  const frames: ClipFrame[] = [];
  let t = 0;
  for (const [dur, pose] of segments) {
    const end = t + dur;
    const start = t;
    for (; t < end; t += 1000 / fps) {
      if (pose == null) {
        frames.push({ t, j: null });
        continue;
      }
      const spec = typeof pose === 'function' ? pose((t - start) / dur) : pose;
      frames.push({
        t,
        j: Array.from(
          synthHand(spec, {
            handedness: opts.handedness ?? 'right',
            rotation,
            position: opts.position ?? [0.1, 1.0, -0.3],
            size: opts.size ?? 1,
            noise: opts.noise ?? 0.002,
            rng,
          }),
        ),
      });
    }
  }
  return {
    version: 1,
    label: opts.label ?? String(opts.expect),
    expect: opts.expect,
    handedness: opts.handedness ?? 'right',
    recordedAt: 'synthetic',
    frames,
  };
}
