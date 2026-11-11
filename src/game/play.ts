/**
 * Runs one level: the scenery, the hint outline, the living creature and
 * its physics, and the stage objectives. Pure game logic over 2D screen
 * coordinates; it is fed recognised shapes and the hand's shadow position
 * by the ShadowPlaySystem each frame.
 */
import { Group, Mesh, type MeshBasicMaterial, RingGeometry, type Vector2 } from '@iwsdk/core';
import type { ShapeId } from '../hand/shapes.js';
import { MAX_SCALE, MIN_SCALE, REFERENCE_RATIO, SCREEN_H, SCREEN_W } from './config.js';
import { BUILDERS, type CreatureRig, HintGhost } from './creatures.js';
import type { LevelDef, Objective, Platform, SceneDef, StageDef } from './levels.js';
import { buildCrow, buildFirefly, buildMoon, buildScenery, setOpacity } from './scenery.js';
import { inkMaterial } from './shapes2d.js';

export type Sfx = 'appear' | 'hop' | 'land' | 'fall' | 'bonk' | 'howl' | 'quack' | 'paddle' | 'scare' | 'chime' | 'firefly' | 'paper' | 'moon' | 'win';

export interface PlayInput {
  dt: number;
  time: number;
  tracked: boolean;
  /** Hand shadow position on the paper (screen-local metres). */
  shadow: Vector2;
  /** Size ratio lamp→screen / lamp→hand. */
  ratio: number;
  /** Shape currently held (after hysteresis), or a summoned creature. */
  active: ShapeId | null;
  /** 0..1 progress toward each shape. */
  progress: Record<ShapeId, number>;
  mouthEdge: 'open' | 'close' | null;
  mouthAmount: number;
  beakEdge: 'open' | 'close' | null;
  beakAmount: number;
}

export interface LevelResult {
  level: number;
  seconds: number;
  stars: number;
  gotExtra: boolean;
}

export interface PlayCallbacks {
  sfx(s: Sfx): void;
  complete(r: LevelResult): void;
}

type CState = 'none' | 'alive' | 'hopping' | 'resting' | 'leaving';

interface Creature {
  kind: ShapeId;
  rig: CreatureRig;
  state: CState;
  x: number;
  y: number;
  scale: number;
  vx: number;
  vy: number;
  fade: number;
  age: number;
  facing: 1 | -1;
}

interface Crow { g: Group; x: number; y: number; scared: boolean; t: number; minScale?: number; isMoon: boolean }

const BOTTOM = -SCREEN_H / 2;
const HALF_W = SCREEN_W / 2;
const WALK_SPEED = 0.35;
const HOP_TIME = 0.6;
const HOP_DIST = 0.12; // per unit scale, on flat ground
const HOP_HEIGHT = 0.085; // per unit scale
const RABBIT_HALF_W = 0.03;
const HOWL_RADIUS = 0.08;
const PADDLE_STEP = 0.032;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const damp = (cur: number, target: number, k: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-k * dt));

export class Play {
  readonly root = new Group();
  level: LevelDef | null = null;
  stageIndex = 0;
  caption = '';
  /** True while the level wants the ghost hand to demonstrate the needed shape. */
  wantGhostHand = false;
  /** Seconds since the stage started without the creature coming alive. */
  stuckTime = 0;

  private scene: SceneDef = { platforms: [] };
  private scenery: Group | null = null;
  private dynamic = new Group();
  private hint: HintGhost | null = null;
  private creature: Creature | null = null;
  /** Creatures that stay on the paper between holds (rabbit on its platform). */
  private rabbitHome: { x: number; y: number } | null = null;
  private duckX = 0;
  private crows: Crow[] = [];
  private rings: { g: Group; t: number }[] = [];
  private firefly: { g: Group; x: number; y: number; got: boolean; t: number } | null = null;
  private rider: CreatureRig | null = null;
  private formHeld = 0;
  private stageDone = false;
  private doneTimer = 0;
  private levelTime = 0;
  private transient: { text: string; t: number } | null = null;
  private wasActive: ShapeId | null = null;

  constructor(private readonly cb: PlayCallbacks) {
    this.root.name = 'play';
    this.dynamic.name = 'dynamic';
    this.root.add(this.dynamic);
  }

  get objective(): Objective | null {
    return this.level?.stages[this.stageIndex]?.objective ?? null;
  }

  get stageDef(): StageDef | null {
    return this.level?.stages[this.stageIndex] ?? null;
  }

  /** The creature the current stage needs. */
  get needed(): ShapeId | null {
    return this.objective?.creature ?? null;
  }

  get creatureInfo() {
    const c = this.creature;
    return c ? { kind: c.kind, state: c.state, x: +c.x.toFixed(3), y: +c.y.toFixed(3), scale: +c.scale.toFixed(2) } : null;
  }

  get creatureAlive(): boolean {
    return this.creature?.state === 'alive';
  }

  start(level: LevelDef): void {
    this.clear();
    this.level = level;
    this.levelTime = 0;
    this.stageIndex = 0;
    this.firefly = { g: buildFirefly(), x: level.extra[0], y: level.extra[1], got: false, t: 0 };
    this.firefly.g.position.set(level.extra[0], level.extra[1], 0.0006);
    this.root.add(this.firefly.g);
    this.enterStage(true);
  }

  clear(): void {
    this.removeCreature();
    this.rabbitHome = null;
    if (this.scenery) this.root.remove(this.scenery);
    this.scenery = null;
    this.dynamic.clear();
    this.crows = [];
    this.rings = [];
    if (this.hint) this.root.remove(this.hint.rig.root);
    this.hint = null;
    if (this.firefly) this.root.remove(this.firefly.g);
    this.firefly = null;
    this.rider = null;
    this.level = null;
    this.caption = '';
  }

  private enterStage(first: boolean): void {
    const level = this.level as LevelDef;
    const st = level.stages[this.stageIndex];
    const newScene = first || st.scene != null;
    if (newScene) {
      this.scene = st.scene ?? level.scene;
      if (this.scenery) this.root.remove(this.scenery);
      this.scenery = buildScenery(this.scene);
      this.root.add(this.scenery);
      this.rabbitHome = null;
      this.cb.sfx('paper');
    }
    this.removeCreature();
    this.dynamic.clear();
    this.crows = [];
    this.rider = null;
    this.formHeld = 0;
    this.stageDone = false;
    this.stuckTime = 0;
    const obj = st.objective;
    if (obj.kind === 'scare') {
      for (const t of obj.targets) {
        const g = t.kind === 'moon' ? buildMoon() : buildCrow();
        g.position.set(t.x, t.y, 0.0005);
        this.dynamic.add(g);
        this.crows.push({ g, x: t.x, y: t.y, scared: false, t: 0, minScale: t.minScale, isMoon: t.kind === 'moon' });
      }
    }
    if (obj.kind === 'paddle') {
      this.duckX = obj.startX;
      if (obj.rider) {
        this.rider = BUILDERS.rabbit();
        this.rider.root.scale.setScalar(0.45);
        this.rider.root.position.set(obj.startX - 0.005, (this.scene.ponds?.[0]?.y ?? -0.1) + 0.012, 0.0007);
        this.dynamic.add(this.rider.root);
      }
    }
    if (this.hint) this.root.remove(this.hint.rig.root);
    this.hint = new HintGhost(obj.creature);
    this.root.add(this.hint.rig.root);
    this.caption = st.caption;
  }

  private say(text: string, seconds = 2): void {
    this.transient = { text, t: seconds };
  }

  get displayCaption(): string {
    return this.transient ? this.transient.text : this.caption;
  }

  // ---------------------------------------------------------------- terrain

  private platformUnder(x: number, y: number): Platform | null {
    let best: Platform | null = null;
    for (const p of this.scene.platforms) {
      if (x >= p.x0 && x <= p.x1 && p.y <= y + 0.006 && (!best || p.y > best.y)) best = p;
    }
    return best;
  }

  /** Walkable x-range on platform p for a creature of the given scale. */
  private walkRange(p: Platform, x: number, scale: number): [number, number] {
    let lo = Math.max(p.x0 + 0.008, -HALF_W + 0.02);
    let hi = Math.min(p.x1 - 0.008, HALF_W - 0.02);
    for (const q of this.scene.platforms) {
      if (q === p || q.y <= p.y + 0.004) continue;
      // a higher platform overlapping this one acts as a wall at its side
      if (q.x0 > p.x0 && q.x0 < p.x1 && q.x0 > x) hi = Math.min(hi, q.x0 - RABBIT_HALF_W * scale * 0.6);
      if (q.x1 < p.x1 && q.x1 > p.x0 && q.x1 < x) lo = Math.max(lo, q.x1 + RABBIT_HALF_W * scale * 0.6);
    }
    for (const w of this.scene.walls ?? []) {
      const fits = w.doorTop != null && w.passMaxScale != null && scale <= w.passMaxScale;
      if (fits) continue;
      if (w.x > x) hi = Math.min(hi, w.x - w.w / 2 - RABBIT_HALF_W * scale);
      else lo = Math.max(lo, w.x + w.w / 2 + RABBIT_HALF_W * scale);
    }
    return [lo, Math.max(lo, hi)];
  }

  // -------------------------------------------------------------- creatures

  private spawn(kind: ShapeId, x: number, y: number, scale: number): Creature {
    this.removeCreature();
    const rig = BUILDERS[kind]();
    rig.root.name = `creature-${kind}`;
    rig.root.position.set(x, y, 0.0008);
    rig.root.scale.setScalar(0.01);
    this.root.add(rig.root);
    const c: Creature = { kind, rig, state: 'alive', x, y, scale, vx: 0, vy: 0, fade: 0, age: 0, facing: 1 };
    this.creature = c;
    this.cb.sfx('appear');
    return c;
  }

  private removeCreature(): void {
    if (this.creature) this.root.remove(this.creature.rig.root);
    this.creature = null;
  }

  private scaleFromRatio(ratio: number): number {
    return clamp(ratio / REFERENCE_RATIO, MIN_SCALE, MAX_SCALE);
  }

  // ------------------------------------------------------------------ update

  update(inp: PlayInput): void {
    if (!this.level) return;
    const dt = Math.min(inp.dt, 0.05);
    this.levelTime += dt;
    if (this.transient) {
      this.transient.t -= dt;
      if (this.transient.t <= 0) this.transient = null;
    }
    const obj = this.objective as Objective;
    const need = obj.creature;
    const active = inp.active === need ? need : null;
    const justEntered = active && this.wasActive !== active;
    const justReleased = !active && this.wasActive === need;
    this.wasActive = active;

    if (this.stageDone) {
      this.updateCreature(inp, dt, false);
      this.doneTimer -= dt;
      if (this.doneTimer <= 0) this.nextStage();
      this.animateWorld(inp, dt);
      return;
    }

    // Wake the creature
    if (justEntered) this.wake(need, inp);
    if (justReleased && this.creature?.state === 'alive') this.release(inp);

    this.updateCreature(inp, dt, active != null);
    this.updateObjective(inp, dt);
    this.updateHint(inp);
    this.animateWorld(inp, dt);

    if (!this.creature || this.creature.state !== 'alive') this.stuckTime += dt;
    else this.stuckTime = 0;
    this.wantGhostHand = this.stuckTime > 10 || (this.level.teaches === need && this.stuckTime > 2 && this.levelTime < 40);
    if (this.stuckTime > 14 && this.stageDef?.stuckHint && !this.transient) this.say(this.stageDef.stuckHint, 4);
  }

  private wake(kind: ShapeId, inp: PlayInput): void {
    const obj = this.objective as Objective;
    const scale = this.scaleFromRatio(inp.ratio);
    if (kind === 'rabbit') {
      let x: number;
      let y: number;
      if (this.rabbitHome) {
        ({ x, y } = this.rabbitHome);
      } else {
        const start = obj.kind === 'reach' ? obj.start : obj.kind === 'form' ? [obj.at[0] - 0.15, obj.at[0] + 0.15] : [-0.1, 0.1];
        x = clamp(inp.tracked ? inp.shadow.x : (start[0] + start[1]) / 2, start[0], start[1]);
        y = this.platformUnder(x, 1)?.y ?? BOTTOM;
      }
      this.spawn('rabbit', x, y, scale);
    } else if (kind === 'wolf') {
      this.spawn('wolf', clamp(inp.shadow.x, -0.18, 0.18), clamp(inp.shadow.y, -0.1, 0.12), scale);
    } else {
      const pond = this.scene.ponds?.[0];
      this.spawn('duck', this.duckX, (pond?.y ?? -0.1) + 0.004, scale);
    }
  }

  private release(inp: PlayInput): void {
    const c = this.creature as Creature;
    const obj = this.objective as Objective;
    if (c.kind === 'rabbit' && obj.kind === 'reach') {
      c.state = 'hopping';
      const s = c.scale;
      c.vx = (HOP_DIST * s) / HOP_TIME;
      c.vy = (4 * HOP_HEIGHT * s) / HOP_TIME;
      this.cb.sfx('hop');
      return;
    }
    if (c.kind === 'rabbit' && obj.kind === 'form' && this.formHeld < obj.hold) this.say('Hold it a little longer');
    c.state = c.kind === 'rabbit' ? 'resting' : 'leaving';
    if (c.kind === 'rabbit') this.rabbitHome = { x: c.x, y: c.y };
    void inp;
  }

  private updateCreature(inp: PlayInput, dt: number, held: boolean): void {
    const c = this.creature;
    if (!c) return;
    c.age += dt;
    const t = inp.time;
    const targetScale = this.scaleFromRatio(inp.ratio);

    if (c.state === 'alive' && held) {
      c.scale = damp(c.scale, targetScale, 6, dt);
      if (c.kind === 'rabbit') {
        const p = this.platformUnder(c.x, c.y) ?? this.scene.platforms[0];
        if (p) {
          const [lo, hi] = this.walkRange(p, c.x, c.scale);
          const target = clamp(inp.tracked ? inp.shadow.x : c.x, lo, hi);
          const step = clamp(target - c.x, -WALK_SPEED * dt, WALK_SPEED * dt);
          c.x += step;
          if (Math.abs(step) > 1e-4) c.facing = step > 0 ? 1 : -1;
          c.y = p.y;
          if (Math.abs(target - c.x) > 0.004 && lo === hi) this.say('Too big to fit through');
          // tried to pass a wall while too big
          for (const w of this.scene.walls ?? []) {
            if (w.passMaxScale != null && c.scale > w.passMaxScale && Math.abs(c.x - (w.x - w.w / 2 - RABBIT_HALF_W * c.scale)) < 0.004 && inp.shadow.x > w.x) {
              this.say('Too big for the door: shrink', 1.2);
            }
          }
        }
      } else if (c.kind === 'wolf') {
        c.x = damp(c.x, clamp(inp.shadow.x, -0.19, 0.19), 12, dt);
        c.y = damp(c.y, clamp(inp.shadow.y, -0.11, 0.13), 12, dt);
        if (c.rig.jaw) c.rig.jaw.rotation.z = -0.55 * inp.mouthAmount;
        if (inp.mouthEdge === 'open') this.howl(c);
      } else if (c.kind === 'duck') {
        if (c.rig.jaw) c.rig.jaw.rotation.z = -0.6 * inp.beakAmount;
        if (inp.beakEdge === 'close') {
          this.duckX += PADDLE_STEP;
          this.cb.sfx('paddle');
        }
        if (inp.beakEdge === 'open') this.cb.sfx('quack');
        c.x = damp(c.x, this.duckX, 6, dt);
        const pond = this.scene.ponds?.[0];
        c.y = (pond?.y ?? -0.1) + 0.004 + Math.sin(t * 2.4) * 0.0015;
      }
    } else if (c.state === 'hopping') {
      this.stepHop(c, dt);
    } else if (c.state === 'leaving') {
      c.fade -= dt * 3;
      if (c.fade <= 0) this.removeCreature();
    } else if (c.state === 'alive' && !held) {
      // summon/stage-complete: keep still
    }

    if (!this.creature) return;
    // appear / fade
    if (c.state === 'alive' || c.state === 'hopping') c.fade = Math.min(1, c.fade + dt * 4);
    const pop = c.age < 0.35 ? 1 + 0.25 * Math.sin((c.age / 0.35) * Math.PI) : 1;
    const r = c.rig.root;
    r.position.set(c.x, c.y, 0.0008);
    const s = c.scale * pop * (0.2 + 0.8 * Math.min(1, c.fade * 1.2));
    r.scale.set(s * c.facing, s, s);
    for (const m of c.rig.mats) {
      m.userData.baseOpacity ??= m.opacity;
      m.opacity = (m.userData.baseOpacity as number) * clamp(c.fade, 0, 1) * (c.state === 'resting' ? 0.85 : 1);
    }
    // idle life: blink, ear wiggle, breathing
    const blink = (t % 3.2) < 0.12;
    for (const e of c.rig.eyes) e.scale.y = blink ? 0.15 : 1;
    if (c.rig.ears) c.rig.ears.forEach((ear, i) => (ear.rotation.z = Math.sin(t * 5 + i) * 0.06 + (c.state === 'hopping' ? -0.25 : 0)));
    if (c.rig.body) {
      const squash = c.state === 'hopping' ? clamp(c.vy * 0.6, -0.15, 0.2) : Math.sin(t * 3) * 0.015;
      c.rig.body.scale.set(1 - squash * 0.5, 1 + squash, 1);
    }
    if (c.state === 'resting' && c.kind === 'rabbit') {
      // sleeping on the paper until the next hold
      for (const e of c.rig.eyes) e.scale.y = 0.15;
    }
  }

  private stepHop(c: Creature, dt: number): void {
    const g = (8 * HOP_HEIGHT * c.scale) / (HOP_TIME * HOP_TIME);
    const prevX = c.x;
    const prevY = c.y;
    c.vy -= g * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    const h = 0.085 * c.scale;
    // walls
    for (const w of this.scene.walls ?? []) {
      const l = w.x - w.w / 2 - RABBIT_HALF_W * c.scale;
      const r = w.x + w.w / 2 + RABBIT_HALF_W * c.scale;
      const crossing = (prevX <= l && c.x > l) || (prevX >= r && c.x < r);
      if (!crossing) continue;
      const throughDoor = w.doorTop != null && c.y + h < w.doorTop && w.passMaxScale != null && c.scale <= w.passMaxScale;
      if (!throughDoor) {
        c.x = prevX;
        c.vx = -c.vx * 0.25;
        this.cb.sfx('bonk');
        this.say('Bonk!', 1);
      }
    }
    // platform sides
    for (const p of this.scene.platforms) {
      const enteringFromLeft = prevX < p.x0 && c.x >= p.x0;
      const enteringFromRight = prevX > p.x1 && c.x <= p.x1;
      if ((enteringFromLeft || enteringFromRight) && c.y < p.y - 0.004) {
        c.x = prevX;
        c.vx = -c.vx * 0.25;
        this.cb.sfx('bonk');
        this.say(c.scale < 1.3 && p.y > -0.05 ? 'Too small: grow by moving toward the lamp' : 'Bonk!', 2.5);
      }
    }
    // landing
    if (c.vy < 0) {
      for (const p of this.scene.platforms) {
        if (c.x >= p.x0 - 0.004 && c.x <= p.x1 + 0.004 && prevY >= p.y - 0.001 && c.y <= p.y) {
          c.y = p.y;
          c.vx = 0;
          c.vy = 0;
          c.state = 'resting';
          c.x = clamp(c.x, p.x0 + 0.004, p.x1 - 0.004);
          this.rabbitHome = { x: c.x, y: c.y };
          this.cb.sfx('land');
          return;
        }
      }
    }
    // fell
    const pond = this.scene.ponds?.find((pd) => c.x >= pd.x0 && c.x <= pd.x1);
    if (c.y < BOTTOM - 0.02 || (pond && c.y < pond.y - 0.01) || Math.abs(c.x) > HALF_W + 0.03) {
      this.cb.sfx('fall');
      this.say(pond ? 'Splash! Try again' : 'Oops! Try again', 2);
      this.removeCreature();
      this.rabbitHome = null;
    }
  }

  private howl(c: Creature): void {
    this.cb.sfx('howl');
    const mouthX = c.x + c.rig.mouth.x * c.scale * c.facing;
    const mouthY = c.y + c.rig.mouth.y * c.scale;
    // sound rings
    for (let i = 0; i < 3; i++) {
      const ring = new Group();
      ring.add(new Mesh(new RingGeometry(0.0105, 0.012, 32), inkMaterial(0x1d1714, 0.0)));
      ring.position.set(mouthX, mouthY, 0.0009);
      ring.userData = { delay: i * 0.12, maxR: HOWL_RADIUS * c.scale };
      this.dynamic.add(ring);
      this.rings.push({ g: ring, t: 0 });
    }
    const R = HOWL_RADIUS * c.scale + 0.02;
    let scared = 0;
    let tooSmall = false;
    for (const crow of this.crows) {
      if (crow.scared) continue;
      const d = Math.hypot(crow.x - mouthX, crow.y - mouthY);
      const reach = crow.isMoon ? 1 : R;
      if (d <= reach) {
        if (crow.minScale && c.scale < crow.minScale) {
          tooSmall = true;
          continue;
        }
        crow.scared = true;
        scared++;
      }
    }
    if (scared) this.cb.sfx(this.crows.some((cr) => cr.isMoon && cr.scared) ? 'moon' : 'scare');
    else if (tooSmall) this.say('Not loud enough: move toward the lamp', 2.5);
    else if (this.crows.some((cr) => !cr.scared)) this.say('Get closer to them', 1.2);
  }

  private updateObjective(inp: PlayInput, dt: number): void {
    const obj = this.objective as Objective;
    const c = this.creature;
    switch (obj.kind) {
      case 'form':
        if (c?.state === 'alive' && inp.active === obj.creature) {
          this.formHeld += dt;
          if (this.formHeld >= obj.hold) this.completeStage();
        }
        break;
      case 'reach':
        if (c && (c.state === 'resting' || c.state === 'alive') && c.x >= obj.goal.x0 && c.x <= obj.goal.x1 && Math.abs(c.y - obj.goal.y) < 0.006) this.completeStage();
        break;
      case 'scare':
        if (this.crows.length && this.crows.every((cr) => cr.scared)) this.completeStage();
        break;
      case 'paddle':
        if (this.rider) this.rider.root.position.x = (c?.x ?? this.duckX) - 0.005;
        if (this.duckX >= obj.goalX) this.completeStage();
        break;
    }
    // hidden firefly: any creature passing close collects it
    const ff = this.firefly;
    if (ff && !ff.got && c && (c.state === 'alive' || c.state === 'hopping')) {
      const cy = c.y + c.rig.height * 0.5 * c.scale;
      if (Math.hypot(ff.x - c.x, ff.y - cy) < 0.025 + 0.012 * c.scale) {
        ff.got = true;
        this.cb.sfx('firefly');
        this.say('You found the firefly!', 1.5);
      }
    }
  }

  private completeStage(): void {
    if (this.stageDone) return;
    this.stageDone = true;
    this.doneTimer = 1.6;
    this.cb.sfx('chime');
    const last = this.stageIndex >= (this.level as LevelDef).stages.length - 1;
    this.say(last ? 'Lovely!' : 'Well done!', 1.6);
    if (this.hint) this.hint.rig.root.visible = false;
  }

  private nextStage(): void {
    const level = this.level as LevelDef;
    if (this.stageIndex < level.stages.length - 1) {
      this.stageIndex++;
      this.enterStage(false);
      return;
    }
    const seconds = this.levelTime;
    const gotExtra = !!this.firefly?.got;
    const stars = 1 + (seconds <= level.par ? 1 : 0) + (gotExtra ? 1 : 0);
    this.cb.sfx('win');
    const result = { level: level.id, seconds, stars, gotExtra };
    this.clear();
    this.cb.complete(result);
  }

  private updateHint(inp: PlayInput): void {
    const h = this.hint;
    if (!h) return;
    const c = this.creature;
    const show = !this.stageDone && (!c || c.state !== 'alive');
    h.rig.root.visible = show;
    if (!show) return;
    const need = this.needed as ShapeId;
    let x = 0;
    let y = 0;
    let scale = this.scaleFromRatio(inp.ratio);
    if (need === 'rabbit') {
      const obj = this.objective as Objective;
      if (this.rabbitHome) ({ x, y } = this.rabbitHome);
      else {
        const start = obj.kind === 'reach' ? obj.start : [-0.15, 0.15];
        x = clamp(inp.tracked ? inp.shadow.x : (start[0] + start[1]) / 2, start[0], start[1]);
        y = this.platformUnder(x, 1)?.y ?? BOTTOM;
      }
      if (c && c.state === 'resting') h.rig.root.visible = false; // sleeping rabbit already shows where
    } else if (need === 'wolf') {
      x = inp.tracked ? clamp(inp.shadow.x, -0.18, 0.18) : -0.05;
      y = inp.tracked ? clamp(inp.shadow.y, -0.1, 0.12) : 0.02;
    } else {
      x = this.duckX;
      y = (this.scene.ponds?.[0]?.y ?? -0.1) + 0.004;
    }
    if (!inp.tracked) scale = 1;
    const r = h.rig.root;
    r.position.set(damp(r.position.x, x, 10, inp.dt), damp(r.position.y, y, 10, inp.dt), 0.0007);
    r.scale.setScalar(scale);
    h.set(inp.progress[need] ?? 0, inp.time);
  }

  private animateWorld(inp: PlayInput, dt: number): void {
    const t = inp.time;
    for (const cr of this.crows) {
      if (cr.isMoon) {
        if (cr.scared) {
          cr.t += dt;
          const k = Math.min(1, cr.t / 2.5);
          cr.g.position.y = cr.y + 0.035 * k;
          cr.g.scale.setScalar(1 + 0.25 * k);
          cr.g.children.forEach((ch) => {
            if (ch.name === 'moon-eye') ch.scale.set(1, 1 + 2.5 * k, 1);
            if (ch.name === 'moon-mouth') ch.scale.set(1 + 0.5 * k, 1 + 2 * k, 1);
          });
        } else {
          cr.g.position.y = cr.y + Math.sin(t * 0.8) * 0.002;
        }
        continue;
      }
      const wing = cr.g.getObjectByName('wing');
      if (cr.scared) {
        cr.t += dt;
        cr.g.position.x = cr.x + cr.t * 0.12;
        cr.g.position.y = cr.y + cr.t * 0.16 + Math.sin(cr.t * 20) * 0.003;
        if (wing) wing.rotation.z = Math.sin(cr.t * 30) * 0.9;
        setOpacity(cr.g, Math.max(0, 1 - cr.t / 1.4));
      } else {
        if (wing) wing.rotation.z = Math.sin(t * 2 + cr.x * 10) * 0.08;
        cr.g.position.y = cr.y + Math.abs(Math.sin(t * 1.3 + cr.x * 20)) * 0.002;
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.t += dt;
      const { delay, maxR } = ring.g.userData as { delay: number; maxR: number };
      const k = (ring.t - delay) / 0.7;
      if (k >= 1) {
        this.dynamic.remove(ring.g);
        this.rings.splice(i, 1);
        continue;
      }
      if (k < 0) continue;
      const r = 0.012 + (maxR - 0.012) * k;
      ring.g.scale.setScalar(r / 0.012);
      ((ring.g.children[0] as Mesh).material as MeshBasicMaterial).opacity = 0.5 * (1 - k);
    }
    const ff = this.firefly;
    if (ff) {
      ff.t += dt;
      if (ff.got) {
        ff.g.visible = false;
      } else {
        ff.g.position.x = ff.x + Math.sin(ff.t * 1.7) * 0.006;
        ff.g.position.y = ff.y + Math.sin(ff.t * 2.3) * 0.004;
        const glow = ff.g.children[0] as unknown as { material: MeshBasicMaterial };
        glow.material.opacity = 0.15 + 0.15 * Math.sin(ff.t * 5);
      }
    }
  }
}
