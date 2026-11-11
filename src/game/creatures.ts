/**
 * Shadow creatures: flat cut-out silhouettes that live on the paper.
 * Each is built from a few parts so it can blink, wiggle its ears, open its
 * jaw or beak, hop, howl and paddle. Units: metres at scale 1, origin at the
 * creature's feet (rabbit) or centre (wolf, duck), facing +x.
 */
import { Color, Group, type Mesh, type MeshBasicMaterial, Vector2 } from '@iwsdk/core';
import type { ShapeId } from '../hand/shapes.js';
import { GLOW_COLD, GLOW_WARM, INK, PAPER } from './config.js';
import { blob, ellipse, inkMaterial, part, pivot, poly } from './shapes2d.js';

export interface CreatureRig {
  root: Group;
  /** All materials, for fading and recolouring. */
  mats: MeshBasicMaterial[];
  eyes: Mesh[];
  /** Optional animated parts. */
  ears?: Group[];
  jaw?: Group;
  body?: Group;
  /** Approximate height at scale 1 (m). */
  height: number;
  /** Mouth/beak tip in creature-local space (for howl waves). */
  mouth: Vector2;
}

function eye(x: number, y: number, r: number): Mesh {
  const m = part(ellipse(x, y, r, r * 1.15), inkMaterial(PAPER), 'eye');
  m.position.z = 0.0004;
  return m;
}

export function buildRabbit(color: number = INK): CreatureRig {
  const mat = inkMaterial(color);
  const root = new Group();
  const body = new Group();
  root.add(body);
  const torso = part(blob([[-0.03, 0.0], [0.012, 0.0], [0.024, 0.016], [0.018, 0.036], [-0.008, 0.042], [-0.032, 0.03], [-0.04, 0.012]]), mat, 'torso');
  const head = part(ellipse(0.024, 0.046, 0.016, 0.013, 0.2), mat, 'head');
  const tail = part(ellipse(-0.04, 0.02, 0.008, 0.008), mat, 'tail');
  const foot = part(ellipse(0.004, 0.003, 0.016, 0.004), mat, 'foot');
  const earL = pivot(0.018, 0.055, part(ellipse(0.012, 0.075, 0.0055, 0.022, -0.25), mat, 'ear'));
  const earR = pivot(0.026, 0.055, part(ellipse(0.024, 0.077, 0.0055, 0.022, -0.05), mat, 'ear'));
  const e = eye(0.03, 0.049, 0.0028);
  body.add(torso, head, tail, foot, earL, earR, e);
  return { root, mats: [mat, e.material as MeshBasicMaterial], eyes: [e], ears: [earL, earR], body, height: 0.1, mouth: new Vector2(0.04, 0.045) };
}

export function buildWolf(color: number = INK): CreatureRig {
  const mat = inkMaterial(color);
  const root = new Group();
  const body = new Group();
  root.add(body);
  // A hand-shadow wolf: long snout, upright ear, hinged lower jaw.
  const skull = part(blob([[-0.05, -0.012], [-0.03, 0.022], [0.0, 0.03], [0.03, 0.022], [0.062, 0.012], [0.07, 0.002], [0.06, -0.006], [0.0, -0.008], [-0.04, -0.02]]), mat, 'skull');
  const ear = part(poly([[-0.018, 0.022], [-0.006, 0.062], [0.008, 0.026]]), mat, 'ear');
  const neck = part(blob([[-0.055, -0.04], [-0.05, 0.0], [-0.03, 0.01], [-0.02, -0.03], [-0.03, -0.05]]), mat, 'neck');
  const jaw = pivot(-0.01, -0.008, part(blob([[-0.012, -0.004], [0.02, -0.006], [0.05, -0.008], [0.056, -0.014], [0.03, -0.022], [-0.01, -0.02]]), mat, 'jaw'));
  const earPivot = pivot(-0.006, 0.025, ear);
  const e = eye(0.012, 0.014, 0.0032);
  body.add(skull, earPivot, neck, jaw, e);
  return { root, mats: [mat, e.material as MeshBasicMaterial], eyes: [e], ears: [earPivot], jaw, body, height: 0.08, mouth: new Vector2(0.066, -0.006) };
}

export function buildDuck(color: number = INK): CreatureRig {
  const mat = inkMaterial(color);
  const root = new Group();
  const body = new Group();
  root.add(body);
  const hull = part(blob([[-0.045, 0.005], [-0.035, -0.012], [0.02, -0.014], [0.034, 0.0], [0.02, 0.016], [-0.02, 0.018], [-0.05, 0.022]]), mat, 'hull');
  const neck = part(ellipse(0.022, 0.026, 0.008, 0.016, -0.3), mat, 'neck');
  const head = part(ellipse(0.028, 0.044, 0.012, 0.011), mat, 'head');
  const beakTop = part(poly([[0.036, 0.048], [0.058, 0.043], [0.036, 0.04]]), mat, 'beak-top');
  const beakLow = pivot(0.036, 0.04, part(poly([[0.036, 0.04], [0.054, 0.039], [0.036, 0.036]]), mat, 'beak-low'));
  const wing = part(ellipse(-0.008, 0.008, 0.018, 0.007, 0.15), inkMaterial(0x3a2f28), 'wing');
  wing.position.z = 0.0003;
  const e = eye(0.031, 0.047, 0.0024);
  body.add(hull, neck, head, beakTop, beakLow, wing, e);
  return {
    root,
    mats: [mat, wing.material as MeshBasicMaterial, e.material as MeshBasicMaterial],
    eyes: [e],
    jaw: beakLow,
    body,
    height: 0.06,
    mouth: new Vector2(0.056, 0.042),
  };
}

export const BUILDERS: Record<ShapeId, (c?: number) => CreatureRig> = {
  rabbit: buildRabbit,
  wolf: buildWolf,
  duck: buildDuck,
};

const cold = new Color(GLOW_COLD);
const warm = new Color(GLOW_WARM);
const tmpColor = new Color();

/**
 * The faint hint outline of the creature the level needs. It warms and
 * glows as the player's hand gets closer to the shape.
 */
export class HintGhost {
  readonly rig: CreatureRig;
  readonly glow: Mesh;
  constructor(readonly shape: ShapeId) {
    this.rig = BUILDERS[shape](GLOW_COLD);
    this.glow = part(ellipse(0, this.rig.height * 0.45, this.rig.height * 0.75, this.rig.height * 0.6), inkMaterial(GLOW_WARM, 0), 'glow');
    this.glow.position.z = -0.0005;
    this.rig.root.add(this.glow);
    this.rig.root.name = `hint-${shape}`;
    for (const e of this.rig.eyes) e.visible = false;
  }

  /** progress 0..1 → colour and opacity; time for a gentle breathing pulse. */
  set(progress: number, time: number): void {
    const pulse = 0.5 + 0.5 * Math.sin(time * 3);
    tmpColor.copy(cold).lerp(warm, progress);
    const opacity = 0.22 + 0.45 * progress + 0.08 * pulse;
    for (const m of this.rig.mats) {
      m.color.copy(tmpColor);
      m.opacity = opacity;
    }
    const gm = this.glow.material as MeshBasicMaterial;
    gm.opacity = progress * progress * (0.25 + 0.1 * pulse);
  }
}
