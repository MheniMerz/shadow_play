/** Jointed paper silhouettes. Metres, XY screen plane, audience on +Z. */
import { Color, Group, type Mesh, type MeshBasicMaterial, Vector2 } from '@iwsdk/core';
import type { ShapeId } from '../hand/shapes.js';
import { GLOW_COLD, GLOW_WARM, INK, SCREEN_H } from './config.js';
import { blob, ellipse, inkMaterial, part, poly } from './shapes2d.js';
import { lace, PuppetParts, type PuppetJoint, type PuppetRod } from '../scene-assets/puppet-parts.js';

export interface CreatureRig {
  root: Group;
  mats: MeshBasicMaterial[];
  eyes: Mesh[];
  ears?: Group[];
  jaw?: Group;
  body?: Group;
  controls?: Group;
  joints?: PuppetJoint[];
  rods?: PuppetRod[];
  height: number;
  mouth: Vector2;
}
function rig(p: PuppetParts, height: number, mouth: Vector2): CreatureRig {
  return { root: p.root, body: p.body, controls: p.controls, mats: p.mats, eyes: p.eyes, joints: p.joints, rods: p.rods, height, mouth };
}

export function buildRabbit(color: number = INK): CreatureRig {
  const p = new PuppetParts(color, 'jointed-rabbit');
  const torso = p.cut(blob([[-0.039,0.017],[-0.032,0.039],[-0.013,0.045],[0.006,0.036],[0.022,0.035],[0.027,0.017],[0.011,0.012],[-0.018,0.01]]), lace(-0.027,0.029,5,0.006));
  p.edge(p.body, torso, 'teal-paper-edge');
  p.add(p.body, torso, 'pierced-leather-torso');
  p.add(p.body, poly([[-0.038,0.027],[-0.048,0.032],[-0.047,0.022],[-0.043,0.015],[-0.035,0.017]]), 'scalloped-tail');
  // Two genuinely separate thighs, shins and feet, all pivoted on pins.
  for (const [x,phase,front] of [[-0.022,0,false],[0.012,Math.PI,true]] as const) {
    const upper = p.hinge(p.body, front ? 'front-shoulder' : 'hind-hip', x,0.023,phase,0.09);
    const plate = front ? poly([[-0.003,0.004],[0.004,0.004],[0.008,-0.009],[0.003,-0.017],[-0.002,-0.012]]) : blob([[-0.008,0.005],[0.006,0.007],[0.012,-0.006],[0.004,-0.017],[-0.008,-0.012]]);
    p.add(upper,plate,'upper-leg',p.plate);
    p.joint(upper,0,0);
    const shin = p.hinge(upper,'knee',0.004,-0.012,phase+0.8,0.12);
    p.add(shin,poly([[-0.002,0.002],[0.003,0.002],[0.001,-0.008],[0.013,-0.009],[0.015,-0.012],[-0.004,-0.012]]),'lower-leg-and-foot');
    p.joint(shin,0,0,0.0021);
    if (front) p.control(shin,0.001,-0.006,0.016);
  }
  const neck = p.hinge(p.body,'neck-pin',0.017,0.038,0.7,0.035);
  const head = p.cut(poly([[-0.006,-0.002],[-0.009,0.009],[-0.003,0.018],[0.009,0.021],[0.016,0.015],[0.021,0.008],[0.029,0.006],[0.027,0.002],[0.014,-0.004],[0.004,-0.006]]),lace(0.002,0.008,2,0.005,0.0008));
  p.add(neck,head,'angular-rabbit-profile');
  p.joint(neck,0,0);
  p.eye(neck,0.014,0.012);
  const ears: Group[] = [];
  for (const [x,y,lean] of [[-0.001,0.014,-0.009],[0.009,0.017,0.003]]) {
    const ear = new Group(); ear.name='pinned-ear'; ear.position.set(x,y,0);
    neck.add(ear);
    p.add(ear,p.cut(poly([[-0.003,0],[lean-0.004,0.035],[lean-0.001,0.045],[lean+0.003,0.036],[0.004,0.002]]),[ellipse(lean,0.028,0.0012,0.01)]),'pierced-ear');
    p.joint(ear,0,0,0.0019);
    ears.push(ear);
  }
  p.control(p.body,-0.018,0.021,-0.015);
  return { ...rig(p,0.1,new Vector2(0.045,0.044)), ears };
}

export function buildWolf(color: number = INK): CreatureRig {
  const p = new PuppetParts(color,'jointed-wolf');
  const neck = p.cut(poly([[-0.043,0.011],[-0.055,-0.012],[-0.05,-0.02],[-0.06,-0.029],[-0.054,-0.032],[-0.061,-0.048],[-0.024,-0.052],[-0.011,-0.036],[-0.02,-0.03],[-0.009,-0.021],[-0.019,-0.017],[-0.009,-0.007],[-0.021,0.004]]),lace(-0.047,-0.031,4,0.006,0.0011));
  p.edge(p.body,neck,'wolf-teal-edge');
  p.add(p.body,neck,'sawtooth-neck');
  const arm=p.hinge(p.body,'wolf-shoulder',-0.034,-0.021,0.2,0.07);
  p.add(arm,poly([[-0.004,0.004],[0.003,0.004],[0.012,-0.02],[0.008,-0.026],[0.002,-0.02]]),'wolf-upper-arm',p.plate);
  const paw=p.hinge(arm,'wolf-elbow',0.008,-0.021,1.8,0.1);
  p.add(paw,poly([[-0.003,0.002],[0.003,0.002],[0.008,-0.01],[0.022,-0.012],[0.023,-0.015],[0.004,-0.015]]),'wolf-paw');
  p.joint(arm,0,0); p.joint(paw,0,0,0.002);
  const head=p.cut(poly([[-0.044,0],[-0.036,0.018],[-0.025,0.027],[-0.013,0.023],[-0.009,0.05],[0,0.022],[0.013,0.014],[0.05,0.007],[0.058,0.003],[0.06,-0.002],[0.053,-0.006],[0.03,-0.006],[0.024,-0.01],[0.019,-0.006],[0.008,-0.01],[-0.004,-0.009],[-0.024,-0.023]]),lace(-0.031,0.007,3,0.006,0.0009));
  p.add(p.body,poly([[-0.031,0.019],[-0.034,0.043],[-0.022,0.022]]),'back-ear',p.plate);
  p.add(p.body,head,'carved-wolf-head');
  p.joint(p.body,-0.025,-0.005,0.003);
  p.eye(p.body,0.003,0.011,0.0023);
  const jaw=new Group(); jaw.name='hinged-mandible'; jaw.position.set(-0.002,-0.008,0.0002); p.body.add(jaw);
  p.add(jaw,poly([[-0.009,0.002],[0.02,-0.003],[0.052,-0.001],[0.047,-0.009],[0.024,-0.012],[0.005,-0.01],[-0.01,-0.004]]),'lower-jaw');
  p.joint(jaw,0,0,0.0026);
  p.control(jaw,0.029,-0.007,0.024);
  p.control(paw,0.014,-0.01,-0.014);
  return { ...rig(p,0.1,new Vector2(0.054,-0.005)), jaw };
}

export function buildDuck(color: number = INK): CreatureRig {
  const p = new PuppetParts(color,'jointed-duck');
  const hull=p.cut(poly([[-0.05,0.024],[-0.04,0.018],[-0.033,0.023],[-0.023,0.017],[0.004,0.02],[0.023,0.008],[0.027,-0.001],[0.013,-0.015],[-0.022,-0.015],[-0.038,-0.006]]),lace(-0.025,-0.007,6,0.005,0.0009));
  p.edge(p.body,hull,'duck-teal-edge');
  p.add(p.body,hull,'scalloped-hull');
  const neck=p.hinge(p.body,'neck-hinge',0.016,0.009,0.7,0.025);
  p.add(neck,p.cut(blob([[-0.005,0],[0.006,-0.003],[0.013,0.022],[0.01,0.036],[0.003,0.034],[-0.005,0.023],[0.001,0.014]]),[ellipse(0.005,0.024,0.0014,0.008)]),'long-pierced-neck');
  p.joint(neck,0,0);
  p.add(neck,poly([[0.002,0.029],[0.004,0.045],[0.01,0.049],[0.019,0.045],[0.021,0.036],[0.015,0.028]]),'duck-head');
  p.add(neck,poly([[0.016,0.037],[0.042,0.032],[0.041,0.028],[0.016,0.029]]),'upper-bill');
  p.eye(neck,0.014,0.039,0.0017);
  const jaw=new Group(); jaw.name='hinged-duck-bill'; jaw.position.set(0.018,0.028,0.0002); neck.add(jaw);
  p.add(jaw,poly([[0,0],[0.023,0],[0.019,-0.005],[-0.002,-0.004]]),'lower-bill');
  p.joint(jaw,0,0,0.0016);
  const wing=p.hinge(p.body,'wing-hinge',0,0.009,Math.PI,0.08);
  p.add(wing,p.cut(poly([[0.005,0.002],[-0.012,0.008],[-0.032,0.004],[-0.02,-0.009],[-0.015,-0.007],[-0.009,-0.013],[0.001,-0.008]]),[poly([[-0.022,0],[-0.005,0.001],[-0.015,-0.004]]),...lace(-0.015,0.003,3,0.005,0.00075)]),'pierced-wing',p.plate);
  p.joint(wing,0,0,0.0028);
  const paddle=p.hinge(p.body,'paddle-hip',-0.013,-0.011,0.8,0.14);
  p.add(paddle,poly([[-0.002,0.001],[0.002,0.001],[0.006,-0.008],[0.017,-0.01],[0.013,-0.013],[0.002,-0.011]]),'webbed-paddle');
  p.joint(paddle,0,0,0.0017);
  p.control(wing,-0.017,-0.002,-0.016);
  p.control(neck,0.007,0.017,0.019);
  return { ...rig(p,0.06,new Vector2(0.056,0.042)), jaw };
}

/** Articulation and rods follow the real pivots. No geometry is allocated per frame. */
export function animatePuppet(rig: CreatureRig, time: number, hopping: boolean, y: number, scale: number): void {
  const stepTime = Math.floor(time * 12) / 12;
  for (const joint of rig.joints ?? []) {
    joint.pivot.rotation.z = joint.rest + Math.sin(stepTime * 4 + joint.phase) * joint.amplitude * (hopping ? 2.5 : 1);
  }
  rig.root.updateWorldMatrix(true, true);
  const endY = (-SCREEN_H / 2 - y) / Math.max(scale, 0.01);
  for (const rod of rig.rods ?? []) {
    rod.anchor.getWorldPosition(rod.point);
    rig.root.worldToLocal(rod.point);
    const dy = Math.max(0, rod.point.y - endY);
    rod.mesh.visible = dy > 0.001;
    rod.mesh.position.set(rod.point.x + rod.lean / 2, rod.point.y - dy / 2, -0.0002);
    rod.mesh.scale.y = Math.hypot(dy, rod.lean);
    rod.mesh.rotation.z = Math.atan2(rod.lean, dy);
  }
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
    if (this.rig.controls) this.rig.controls.visible = false;
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
