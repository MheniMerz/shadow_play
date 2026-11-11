import { describe, expect, it } from 'vitest';
import { applyShifts, calibrateShape, calibratedShapes, MAX_SHIFT, relaxShape } from '../src/hand/calibration.js';
import { computeFeatures } from '../src/hand/features.js';
import { SHAPES, scoreShape } from '../src/hand/shapes.js';
import { mulberry32, POSES, synthHand, type HandPoseSpec } from '../src/hand/synthetic.js';

/** A less flexible player: ears barely apart, ring and pinky only half curled, thumb not quite on the ring tip. */
const stiffRabbit = (): HandPoseSpec => {
  const p = POSES.rabbit();
  p.fingers.index.abd = 3;
  p.fingers.middle.abd = -2;
  p.fingers.ring = { mcp: 45, pip: 45, dip: 20, abd: 0 };
  p.fingers.pinky = { mcp: 45, pip: 45, dip: 20, abd: 0 };
  return p;
};

const samples = (spec: HandPoseSpec, n = 30, seed = 3) => {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => computeFeatures(synthHand(spec, { noise: 0.0015, rng }), 'right'));
};

describe('calibration', () => {
  it('a stiff hand fails the default rabbit but passes after calibration', () => {
    const f = computeFeatures(synthHand(stiffRabbit()), 'right');
    expect(scoreShape(SHAPES.rabbit, f).score).toBeLessThan(0.8);
    const shifts = calibrateShape(SHAPES.rabbit, samples(stiffRabbit()));
    expect(scoreShape(applyShifts(SHAPES.rabbit, shifts), f).score).toBeGreaterThan(0.8);
  });

  it('never shifts a rule by more than MAX_SHIFT widths, and only makes rules easier', () => {
    const shifts = calibrateShape(SHAPES.rabbit, samples(POSES.fist()));
    for (const rule of SHAPES.rabbit.rules) {
      const s = shifts[rule.label] ?? 0;
      expect(Math.abs(s)).toBeLessThanOrEqual(MAX_SHIFT * (rule.hi - rule.lo) + 1e-9);
      if (rule.dir === 'up') expect(s).toBeLessThanOrEqual(0);
      else expect(s).toBeGreaterThanOrEqual(0);
    }
  });

  it('a comfortable hand needs no shifts', () => {
    expect(calibrateShape(SHAPES.wolf, samples(POSES.wolf()))).toEqual({});
  });

  it('calibrating the rabbit does not make a fist or an open hand trigger it', () => {
    const shapes = calibratedShapes({ rabbit: calibrateShape(SHAPES.rabbit, samples(stiffRabbit())) });
    for (const pose of [POSES.fist(), POSES.openHand(), POSES.wolf()]) {
      expect(scoreShape(shapes.rabbit, computeFeatures(synthHand(pose), 'right')).score).toBeLessThan(0.8);
    }
  });

  it('relaxed shapes accept a stiff pose so calibration can start', () => {
    const f = computeFeatures(synthHand(stiffRabbit()), 'right');
    expect(scoreShape(relaxShape(SHAPES.rabbit), f).score).toBeGreaterThan(0.5);
  });
});
