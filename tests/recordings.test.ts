/**
 * Replays every real recording in recordings/*.json. Record clips on the
 * headset with debug mode on (see README), then run `npm test`.
 * Pass criteria (from the plan): each correct clip is recognised within
 * 0.5 s of the pose starting, and no wrong clip triggers a creature.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type HandClip, replayClip } from '../src/hand/clip.js';

const dir = join(__dirname, '..', 'recordings');
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];

describe.skipIf(files.length === 0)('recorded clips', () => {
  it.each(files)('%s', (file) => {
    const clip = JSON.parse(readFileSync(join(dir, file), 'utf8')) as HandClip;
    const r = replayClip(clip);
    const wrong = [...r.entered].filter((s) => s !== clip.expect);
    expect(wrong, `wrong shapes entered (max scores ${JSON.stringify(r.maxScores)})`).toEqual([]);
    if (clip.expect) {
      expect(r.firstEnterMs, `never recognised (max scores ${JSON.stringify(r.maxScores)})`).not.toBeNull();
      // Clips start with the player already forming the pose; allow the hold time + 0.5 s.
      expect(r.firstEnterMs as number).toBeLessThan(1500);
    }
  });
});
