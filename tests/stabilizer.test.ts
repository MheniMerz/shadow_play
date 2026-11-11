import { describe, expect, it } from 'vitest';
import { replayClip } from '../src/hand/clip.js';
import { POSES, blendPoses } from '../src/hand/synthetic.js';
import { synthClip } from './helpers.js';

describe('stabilizer on synthetic clips (72 fps, 2 mm noise)', () => {
  it.each(['rabbit', 'wolf', 'duck'] as const)('recognises %s within 0.5 s', (shape) => {
    for (let seed = 1; seed <= 10; seed++) {
      const clip = synthClip([[500, POSES.relaxed()], [1500, POSES[shape]()]], { expect: shape, seed });
      const r = replayClip(clip);
      expect(r.firstEnterMs, `seed ${seed}`).not.toBeNull();
      expect((r.firstEnterMs as number) - 500).toBeLessThan(500);
      expect([...r.entered]).toEqual([shape]);
    }
  });

  it('never triggers on near misses and other hands', () => {
    const near = [POSES.openHand(), POSES.relaxed(), POSES.fist(), POSES.point(), POSES.rabbitNoThumb(), POSES.flatThumbIn(), POSES.thumbsUp()];
    near.forEach((pose, i) => {
      const r = replayClip(synthClip([[2000, pose]], { expect: null, seed: 100 + i }));
      expect(r.entered.size, `pose ${i}`).toBe(0);
    });
  });

  it('ignores a pose held for less than 250 ms', () => {
    const r = replayClip(synthClip([[500, POSES.relaxed()], [150, POSES.rabbit()], [800, POSES.relaxed()]], { expect: 'rabbit' }));
    expect(r.entered.size).toBe(0);
  });

  it('holds through a 150 ms tracking glitch, exits after release', () => {
    const r = replayClip(
      synthClip(
        [[1000, POSES.rabbit()], [150, POSES.openHand()], [1000, POSES.rabbit()], [1000, POSES.openHand()]],
        { expect: 'rabbit' },
      ),
    );
    const kinds = r.events.map((e) => `${e.type}:${e.shape}`);
    expect(kinds).toEqual(['enter:rabbit', 'exit:rabbit']);
  });

  it('exits when the hand is lost', () => {
    const r = replayClip(synthClip([[1000, POSES.wolf()], [600, null]], { expect: 'wolf' }));
    expect(r.events.map((e) => e.type)).toEqual(['enter', 'exit']);
  });

  it('does not trigger while morphing slowly between unrelated poses', () => {
    const r = replayClip(
      synthClip([[2000, (t) => blendPoses(POSES.fist(), POSES.openHand(), t)]], { expect: null }),
    );
    expect(r.entered.size).toBe(0);
  });
});

describe('dynamic gestures', () => {
  it('wolf howls once per mouth opening', () => {
    const segs: [number, ReturnType<typeof POSES.wolf>][] = [[800, POSES.wolf(0)]];
    for (let i = 0; i < 3; i++) segs.push([400, POSES.wolf(1)], [400, POSES.wolf(0)]);
    const r = replayClip(synthClip(segs, { expect: 'wolf' }));
    expect(r.howls).toBe(3);
    expect(r.events.filter((e) => e.type === 'exit')).toHaveLength(0);
  });

  it('duck paddles once per beak open-close cycle', () => {
    const segs: [number, ReturnType<typeof POSES.duck>][] = [[800, POSES.duck(0)]];
    for (let i = 0; i < 4; i++) segs.push([300, POSES.duck(1)], [300, POSES.duck(0)]);
    const r = replayClip(synthClip(segs, { expect: 'duck' }));
    expect(r.paddles).toBe(4);
  });
});
