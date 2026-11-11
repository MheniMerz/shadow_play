import { computeFeatures } from '../src/hand/features.js';
import { SHAPES, scoreShape } from '../src/hand/shapes.js';
import { mulberry32, POSES, synthHand } from '../src/hand/synthetic.js';
import { randomRotation } from '../tests/helpers.js';
for (const noise of [0.001, 0.002]) for (const id of ['rabbit', 'wolf', 'duck'] as const) {
  const rng = mulberry32(11); const weak: Record<string, number> = {}; let pass = 0;
  for (let i = 0; i < 200; i++) {
    const s = scoreShape(SHAPES[id], computeFeatures(synthHand(POSES[id](), { rotation: randomRotation(rng), noise, rng }), 'right'));
    if (s.score > 0.8) pass++; else weak[s.weakest] = (weak[s.weakest] ?? 0) + 1;
  }
  console.log(noise, id, pass / 200, JSON.stringify(weak));
}
