/**
 * Per-player calibration: the first time a shape appears, the player holds
 * it for a second and we record their own feature values. Rule thresholds
 * then shift (only ever easier, and only by a bounded amount) so that the
 * player's own pose scores well. Helps small, large and less flexible hands.
 */
import { FEATURE_KEYS, type Features } from './features.js';
import { type Rule, SHAPES, type ShapeDef, type ShapeId } from './shapes.js';

/** Threshold shift per rule, keyed by rule label. */
export type CalibrationData = Partial<Record<ShapeId, Record<string, number>>>;

/** How far (in units of the rule's lo..hi width) a calibration may relax a rule. */
export const MAX_SHIFT = 0.75;
/** Margin (in rule widths) the calibrated value should clear its threshold by. */
export const MARGIN = 0.25;

export function medianFeatures(samples: Features[]): Features {
  const out = {} as Features;
  for (const k of FEATURE_KEYS) {
    const vals = samples.map((s) => s[k]).sort((x, y) => x - y);
    const m = vals.length >> 1;
    out[k] = vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2;
  }
  return out;
}

/** Shift for one rule given the player's held value (0 if already comfortable). */
export function ruleShift(rule: Rule, value: number): number {
  const w = rule.hi - rule.lo;
  const margin = MARGIN * w;
  const max = MAX_SHIFT * w;
  if (rule.dir === 'up') {
    // good when value >= hi
    const need = value - margin - rule.hi;
    return need < 0 ? Math.max(need, -max) : 0;
  }
  // good when value <= lo
  const need = value + margin - rule.lo;
  return need > 0 ? Math.min(need, max) : 0;
}

export function calibrateShape(def: ShapeDef, samples: Features[]): Record<string, number> {
  const med = medianFeatures(samples);
  const shifts: Record<string, number> = {};
  for (const rule of def.rules) {
    const s = ruleShift(rule, med[rule.feature]);
    if (s !== 0) shifts[rule.label] = s;
  }
  return shifts;
}

export function applyShifts(def: ShapeDef, shifts: Record<string, number> | undefined): ShapeDef {
  if (!shifts) return def;
  return {
    ...def,
    rules: def.rules.map((r) => {
      const s = shifts[r.label] ?? 0;
      return s ? { ...r, lo: r.lo + s, hi: r.hi + s } : r;
    }),
  };
}

export function calibratedShapes(data: CalibrationData): Record<ShapeId, ShapeDef> {
  return {
    rabbit: applyShifts(SHAPES.rabbit, data.rabbit),
    wolf: applyShifts(SHAPES.wolf, data.wolf),
    duck: applyShifts(SHAPES.duck, data.duck),
  };
}

/** A forgiving version of a shape, used to decide that the player is "roughly" holding it. */
export function relaxShape(def: ShapeDef, widths = MAX_SHIFT): ShapeDef {
  return {
    ...def,
    rules: def.rules.map((r) => {
      const s = (r.hi - r.lo) * widths * (r.dir === 'up' ? -1 : 1);
      return { ...r, lo: r.lo + s, hi: r.hi + s };
    }),
  };
}
