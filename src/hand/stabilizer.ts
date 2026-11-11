/**
 * Makes recognition steady: smooths features over a few frames, then applies
 * hysteresis. A shape is entered when its score stays above `enter` for
 * `enterMs`, and left only when it stays below `exit` for `exitMs`.
 */
import { emptyFeatures, FEATURE_KEYS, type Features } from './features.js';
import {
  SHAPE_IDS,
  SHAPES,
  type ShapeDef,
  type ShapeId,
  type ShapeScores,
  scoreAll,
} from './shapes.js';

export interface StabilizerOptions {
  enter: number;
  exit: number;
  enterMs: number;
  exitMs: number;
  smoothFrames: number;
  /** Hand missing for this long counts as leaving the shape. */
  lostMs: number;
}

export const DEFAULT_STABILIZER: StabilizerOptions = {
  enter: 0.8,
  exit: 0.6,
  enterMs: 250,
  exitMs: 300,
  smoothFrames: 5,
  lostMs: 300,
};

export type ShapeEvent =
  | { type: 'enter'; shape: ShapeId; t: number }
  | { type: 'exit'; shape: ShapeId; t: number };

/** Moving average over the last N feature frames. */
export class FeatureSmoother {
  private buf: Features[] = [];
  private head = 0;
  private readonly out = emptyFeatures();
  constructor(private readonly n: number) {}

  reset(): void {
    this.buf.length = 0;
    this.head = 0;
  }

  push(f: Features): Features {
    if (this.buf.length < this.n) {
      this.buf.push({ ...f });
    } else {
      Object.assign(this.buf[this.head], f);
      this.head = (this.head + 1) % this.n;
    }
    for (const k of FEATURE_KEYS) {
      let s = 0;
      for (const b of this.buf) s += b[k];
      this.out[k] = s / this.buf.length;
    }
    return this.out;
  }
}

export class ShapeStabilizer {
  readonly opts: StabilizerOptions;
  active: ShapeId | null = null;
  readonly scores: ShapeScores = { rabbit: 0, wolf: 0, duck: 0 };
  /** Shapes that may be entered. Others are scored but ignored. */
  allowed: Set<ShapeId> = new Set(SHAPE_IDS);
  shapes: Record<ShapeId, ShapeDef>;

  private readonly smoother: FeatureSmoother;
  private aboveSince: Record<ShapeId, number | null> = {
    rabbit: null,
    wolf: null,
    duck: null,
  };
  private belowSince: number | null = null;
  private lastSeen = -Infinity;
  smoothed: Features | null = null;

  constructor(
    opts: Partial<StabilizerOptions> = {},
    shapes: Record<ShapeId, ShapeDef> = SHAPES,
  ) {
    this.opts = { ...DEFAULT_STABILIZER, ...opts };
    this.smoother = new FeatureSmoother(this.opts.smoothFrames);
    this.shapes = shapes;
  }

  reset(): void {
    this.active = null;
    this.smoother.reset();
    this.smoothed = null;
    this.belowSince = null;
    for (const id of SHAPE_IDS) {
      this.aboveSince[id] = null;
      this.scores[id] = 0;
    }
  }

  /** Feed one frame of raw features (or null when the hand is not tracked). */
  update(f: Features | null, t: number, events: ShapeEvent[] = []): ShapeEvent[] {
    if (f == null) {
      if (t - this.lastSeen > this.opts.lostMs) {
        if (this.active) events.push({ type: 'exit', shape: this.active, t });
        this.reset();
      }
      return events;
    }
    this.lastSeen = t;
    this.smoothed = this.smoother.push(f);
    scoreAll(this.smoothed, this.shapes, this.scores);

    const { enter, exit, enterMs, exitMs } = this.opts;
    if (this.active) {
      const s = this.scores[this.active];
      if (s < exit) {
        this.belowSince ??= t;
        if (t - this.belowSince >= exitMs) {
          events.push({ type: 'exit', shape: this.active, t });
          this.active = null;
          this.belowSince = null;
          for (const id of SHAPE_IDS) this.aboveSince[id] = null;
        }
      } else {
        this.belowSince = null;
      }
      return events;
    }

    let best: ShapeId | null = null;
    for (const id of SHAPE_IDS) {
      const s = this.scores[id];
      if (s > enter && this.allowed.has(id)) {
        this.aboveSince[id] ??= t;
        if (t - (this.aboveSince[id] as number) >= enterMs) {
          if (best == null || s > this.scores[best]) best = id;
        }
      } else {
        this.aboveSince[id] = null;
      }
    }
    if (best) {
      this.active = best;
      this.belowSince = null;
      events.push({ type: 'enter', shape: best, t });
    }
    return events;
  }

  /** 0..1 progress toward entering `shape` (score and hold time combined). */
  progress(shape: ShapeId, t: number): number {
    if (this.active === shape) return 1;
    const s = this.scores[shape];
    const since = this.aboveSince[shape];
    const hold = since == null ? 0 : Math.min(1, (t - since) / this.opts.enterMs);
    return Math.min(1, s / this.opts.enter) * 0.8 + hold * 0.2;
  }
}

/**
 * Binary open/closed tracker with hysteresis, for the wolf's mouth and the
 * duck's beak. Reports edges only, so a howl fires once per opening.
 */
export class OpenCloseTracker {
  open = false;
  constructor(
    private readonly openAt: number,
    private readonly closeAt: number,
  ) {}

  reset(): void {
    this.open = false;
  }

  /** Returns 'open' or 'close' on an edge, otherwise null. */
  update(value: number): 'open' | 'close' | null {
    if (!this.open && value >= this.openAt) {
      this.open = true;
      return 'open';
    }
    if (this.open && value <= this.closeAt) {
      this.open = false;
      return 'close';
    }
    return null;
  }

  /** 0 closed … 1 open, continuous. */
  amount(value: number): number {
    return Math.min(1, Math.max(0, (value - this.closeAt) / (this.openAt - this.closeAt)));
  }
}
