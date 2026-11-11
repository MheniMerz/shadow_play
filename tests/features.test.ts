import { describe, expect, it } from 'vitest';
import { computeFeatures, palmNormal } from '../src/hand/features.js';
import { SHAPE_IDS, SHAPES, scoreShape } from '../src/hand/shapes.js';
import { mulberry32, POSES, synthHand, type PoseName } from '../src/hand/synthetic.js';
import { randomRotation } from './helpers.js';

const positives: [PoseName, (typeof SHAPE_IDS)[number]][] = [
  ['rabbit', 'rabbit'],
  ['wolf', 'wolf'],
  ['duck', 'duck'],
];
const negatives: PoseName[] = ['openHand', 'relaxed', 'fist', 'point', 'rabbitNoThumb', 'flatThumbIn', 'thumbsUp'];

const spec = (n: PoseName) => (POSES[n] as () => ReturnType<typeof POSES.rabbit>)();

describe('features', () => {
  it('do not depend on position, rotation, handedness or hand size', () => {
    const rng = mulberry32(7);
    const base = computeFeatures(synthHand(spec('rabbit')), 'right');
    for (let i = 0; i < 20; i++) {
      const handedness = i % 2 ? 'left' : 'right';
      const f = computeFeatures(
        synthHand(spec('rabbit'), {
          handedness,
          rotation: randomRotation(rng),
          position: [rng(), rng() + 1, -rng()],
          size: 0.8 + rng() * 0.4,
        }),
        handedness,
      );
      expect(f.curlRing).toBeCloseTo(base.curlRing, 3);
      expect(f.thumbToRing).toBeCloseTo(base.thumbToRing, 4);
      expect(f.indexMiddleSpread).toBeCloseTo(base.indexMiddleSpread, 3);
      expect(f.thumbOut).toBeCloseTo(base.thumbOut, 4);
    }
  });

  it('palm normal points out of the palm for both hands', () => {
    // Palm down (-y): rotate the hand frame so dorsal (+z) maps to +y and fingers to -z.
    const q: [number, number, number, number] = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];
    for (const h of ['left', 'right'] as const) {
      const n = palmNormal(synthHand(spec('openHand'), { handedness: h, rotation: q }), h);
      expect(n[1]).toBeLessThan(-0.9);
    }
  });
});

describe('shape scores', () => {
  it.each(positives)('%s pose scores high as %s under noise and any orientation', (pose, shape) => {
    const rng = mulberry32(11);
    let pass = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
      const j = synthHand(spec(pose), { rotation: randomRotation(rng), noise: 0.002, rng, size: 0.85 + rng() * 0.3 });
      if (scoreShape(SHAPES[shape], computeFeatures(j, 'right')).score > 0.8) pass++;
    }
    expect(pass / N).toBeGreaterThan(0.95);
  });

  it.each(negatives)('%s does not look like any creature', (pose) => {
    const rng = mulberry32(13);
    for (let i = 0; i < 100; i++) {
      const f = computeFeatures(synthHand(spec(pose), { rotation: randomRotation(rng), noise: 0.002, rng }), 'right');
      for (const id of SHAPE_IDS) expect(scoreShape(SHAPES[id], f).score, `${pose} as ${id}`).toBeLessThan(0.8);
    }
  });

  it('each creature pose matches only its own shape', () => {
    for (const [pose, shape] of positives) {
      const f = computeFeatures(synthHand(spec(pose)), 'right');
      for (const id of SHAPE_IDS) {
        if (id !== shape) expect(scoreShape(SHAPES[id], f).score).toBeLessThan(0.3);
      }
    }
  });

  it('wolf stays a wolf with its mouth open, duck stays a duck with its beak open', () => {
    expect(scoreShape(SHAPES.wolf, computeFeatures(synthHand(POSES.wolf(1)), 'right')).score).toBeGreaterThan(0.9);
    expect(scoreShape(SHAPES.duck, computeFeatures(synthHand(POSES.duck(1)), 'right')).score).toBeGreaterThan(0.9);
  });
});
