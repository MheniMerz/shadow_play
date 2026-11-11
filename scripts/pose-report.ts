/** Prints features and shape scores for every synthetic pose: `npx vite-node scripts/pose-report.ts` */
import { computeFeatures } from '../src/hand/features.js';
import { SHAPES, scoreShape, SHAPE_IDS } from '../src/hand/shapes.js';
import { POSES, synthHand, type PoseName } from '../src/hand/synthetic.js';

const rows: Record<string, unknown>[] = [];
for (const name of Object.keys(POSES) as PoseName[]) {
  const spec = (POSES[name] as (o?: number) => ReturnType<typeof POSES.rabbit>)();
  const f = computeFeatures(synthHand(spec), 'right');
  const row: Record<string, unknown> = { pose: name };
  for (const [k, v] of Object.entries(f)) row[k] = Number(v.toFixed(3));
  for (const id of SHAPE_IDS) {
    const s = scoreShape(SHAPES[id], f);
    row[id] = `${s.score.toFixed(2)}${s.score < 0.8 ? ' (' + s.weakest + ')' : ''}`;
  }
  rows.push(row);
}
for (const extra of [['wolf open', POSES.wolf(1)], ['duck open', POSES.duck(1)]] as const) {
  const f = computeFeatures(synthHand(extra[1]), 'right');
  rows.push({ pose: extra[0], pinkyDrop: f.pinkyDrop.toFixed(3), thumbToMiddle: f.thumbToMiddle.toFixed(3),
    ...Object.fromEntries(SHAPE_IDS.map((id) => [id, scoreShape(SHAPES[id], f).score.toFixed(2)])) });
}
for (const r of rows) console.log(JSON.stringify(r));
