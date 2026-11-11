/**
 * Level data. One small record per level, so new levels are content, not
 * code. Coordinates are screen-local metres: x ∈ [-0.22, 0.22] left→right,
 * y ∈ [-0.16, 0.16] bottom→top. Ground surfaces are given by their top y.
 */
import type { ShapeId } from '../hand/shapes.js';

export interface Platform { x0: number; x1: number; y: number }
export interface Pond { x0: number; x1: number; y: number }
/** A solid wall from the bottom of the screen to the top, with an optional door gap. */
export interface Wall { x: number; w: number; doorTop?: number; passMaxScale?: number }
export type PropKind = 'lantern' | 'carrot' | 'flag' | 'fence' | 'grass' | 'tree' | 'stars';
export interface Prop { kind: PropKind; x: number; y: number; s?: number }

export interface SceneDef {
  platforms: Platform[];
  ponds?: Pond[];
  walls?: Wall[];
  props?: Prop[];
}

export type Objective =
  | { kind: 'form'; creature: 'rabbit' | 'wolf' | 'duck'; hold: number; at: [number, number] }
  | { kind: 'reach'; creature: 'rabbit'; start: [number, number]; goal: { x0: number; x1: number; y: number } }
  | { kind: 'scare'; creature: 'wolf'; targets: { x: number; y: number; kind: 'crow' | 'moon'; minScale?: number }[] }
  | { kind: 'paddle'; creature: 'duck'; startX: number; goalX: number; rider?: boolean };

export interface StageDef {
  caption: string;
  objective: Objective;
  /** Replaces the level scene for this stage. */
  scene?: SceneDef;
  /** Caption shown after this many seconds without progress. */
  stuckHint?: string;
}

export interface LevelDef {
  id: number;
  name: string;
  scene: SceneDef;
  stages: StageDef[];
  /** Seconds for the speed star. */
  par: number;
  /** Hidden firefly for the third star. */
  extra: [number, number];
  /** Shapes introduced in this level (first-time calibration and the ghost hand). */
  teaches?: ShapeId;
}

const G = -0.11; // default ground height

export const LEVELS: LevelDef[] = [
  {
    id: 1,
    name: 'First light',
    teaches: 'rabbit',
    scene: {
      platforms: [{ x0: -0.23, x1: 0.23, y: G }],
      props: [{ kind: 'grass', x: -0.16, y: G }, { kind: 'grass', x: 0.17, y: G, s: 0.8 }],
    },
    stages: [{ caption: 'Make a rabbit with your hand', objective: { kind: 'form', creature: 'rabbit', hold: 1.0, at: [0, G] }, stuckHint: 'Two fingers up, thumb on your ring finger' }],
    par: 30,
    extra: [0.15, -0.055],
  },
  {
    id: 2,
    name: 'The gap',
    scene: {
      platforms: [{ x0: -0.23, x1: -0.035, y: -0.1 }, { x0: 0.035, x1: 0.23, y: -0.1 }],
      props: [{ kind: 'lantern', x: 0.15, y: -0.1 }, { kind: 'grass', x: -0.18, y: -0.1 }],
    },
    stages: [{ caption: 'Walk to the edge, then let go to hop', objective: { kind: 'reach', creature: 'rabbit', start: [-0.2, -0.045], goal: { x0: 0.05, x1: 0.23, y: -0.1 } }, stuckHint: 'Open your hand to jump' }],
    par: 35,
    extra: [0.0, 0.0],
  },
  {
    id: 3,
    name: 'Tall grass',
    scene: {
      platforms: [{ x0: -0.23, x1: 0.06, y: G }, { x0: 0.07, x1: 0.23, y: -0.01 }],
      props: [{ kind: 'grass', x: 0.02, y: G, s: 1.6 }, { kind: 'carrot', x: 0.16, y: -0.01 }],
    },
    stages: [{ caption: 'Move your hand toward the lamp to grow', objective: { kind: 'reach', creature: 'rabbit', start: [-0.2, 0.05], goal: { x0: 0.07, x1: 0.23, y: -0.01 } }, stuckHint: 'A bigger rabbit jumps higher' }],
    par: 45,
    extra: [0.12, 0.09],
  },
  {
    id: 4,
    name: 'Crows',
    teaches: 'wolf',
    scene: {
      platforms: [{ x0: -0.23, x1: 0.23, y: G }],
      props: [{ kind: 'fence', x: 0, y: G }],
    },
    stages: [{
      caption: 'Make a wolf. Drop your pinky to howl',
      objective: { kind: 'scare', creature: 'wolf', targets: [{ x: -0.13, y: -0.035, kind: 'crow' }, { x: 0.0, y: -0.035, kind: 'crow' }, { x: 0.13, y: -0.035, kind: 'crow' }] },
      stuckHint: 'Howl close to each crow',
    }],
    par: 45,
    extra: [-0.17, 0.1],
  },
  {
    id: 5,
    name: 'Pond',
    teaches: 'duck',
    scene: {
      platforms: [{ x0: -0.23, x1: -0.12, y: -0.085 }, { x0: 0.14, x1: 0.23, y: -0.085 }],
      ponds: [{ x0: -0.12, x1: 0.14, y: -0.1 }],
      props: [{ kind: 'flag', x: 0.18, y: -0.085 }, { kind: 'grass', x: -0.19, y: -0.085 }],
    },
    stages: [{ caption: 'Make a duck. Open and close its beak to paddle', objective: { kind: 'paddle', creature: 'duck', startX: -0.09, goalX: 0.12 }, stuckHint: 'Thumb down, then back up: one paddle' }],
    par: 50,
    extra: [0.02, -0.04],
  },
  {
    id: 6,
    name: 'Small door',
    scene: {
      platforms: [{ x0: -0.23, x1: 0.23, y: G }, { x0: 0.11, x1: 0.23, y: -0.035 }],
      walls: [{ x: 0.0, w: 0.014, doorTop: -0.06, passMaxScale: 0.8 }],
      props: [{ kind: 'carrot', x: 0.17, y: -0.035 }],
    },
    stages: [
      { caption: 'Move away from the lamp to shrink through the door', objective: { kind: 'reach', creature: 'rabbit', start: [-0.2, -0.03], goal: { x0: 0.02, x1: 0.1, y: G } }, stuckHint: 'Hands closer to the paper make a smaller rabbit' },
      { caption: 'Now grow and hop up to the carrot', objective: { kind: 'reach', creature: 'rabbit', start: [0.02, 0.1], goal: { x0: 0.11, x1: 0.23, y: -0.035 } } },
    ],
    par: 70,
    extra: [-0.12, 0.05],
  },
  {
    id: 7,
    name: 'Relay',
    scene: {
      platforms: [{ x0: -0.23, x1: -0.13, y: -0.085 }, { x0: 0.09, x1: 0.23, y: -0.085 }],
      ponds: [{ x0: -0.13, x1: 0.09, y: -0.1 }],
      props: [{ kind: 'tree', x: 0.17, y: -0.085 }],
    },
    stages: [
      { caption: 'The duck carries the rabbit across', objective: { kind: 'paddle', creature: 'duck', startX: -0.1, goalX: 0.07, rider: true } },
      { caption: 'Now the wolf: chase the crows off the tree', objective: { kind: 'scare', creature: 'wolf', targets: [{ x: 0.14, y: 0.02, kind: 'crow' }, { x: 0.19, y: 0.05, kind: 'crow' }] } },
    ],
    par: 80,
    extra: [-0.03, 0.08],
  },
  {
    id: 8,
    name: 'Moonrise',
    scene: {
      platforms: [{ x0: -0.23, x1: -0.03, y: -0.1 }, { x0: 0.05, x1: 0.23, y: -0.1 }],
      props: [{ kind: 'stars', x: 0, y: 0.08 }],
    },
    stages: [
      { caption: 'Rabbit: hop across', objective: { kind: 'reach', creature: 'rabbit', start: [-0.2, -0.04], goal: { x0: 0.07, x1: 0.23, y: -0.1 } } },
      {
        caption: 'Duck: paddle to the far bank',
        scene: {
          platforms: [{ x0: -0.23, x1: -0.12, y: -0.085 }, { x0: 0.14, x1: 0.23, y: -0.085 }],
          ponds: [{ x0: -0.12, x1: 0.14, y: -0.1 }],
          props: [{ kind: 'stars', x: 0, y: 0.08 }],
        },
        objective: { kind: 'paddle', creature: 'duck', startX: -0.09, goalX: 0.12 },
      },
      {
        caption: 'Wolf: a big howl wakes the moon',
        scene: { platforms: [{ x0: -0.23, x1: 0.23, y: G }], props: [{ kind: 'stars', x: 0, y: 0.08 }, { kind: 'tree', x: -0.17, y: G }] },
        objective: { kind: 'scare', creature: 'wolf', targets: [{ x: 0.1, y: 0.07, kind: 'moon', minScale: 1.35 }] },
        stuckHint: 'Bring the wolf closer to the lamp, then howl',
      },
    ],
    par: 120,
    extra: [0.16, 0.0],
  },
];
