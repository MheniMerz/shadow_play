/**
 * A softly glowing "ghost hand" that shows how to form each shape, floating
 * where the player's hand should go. It does not cast a shadow.
 */
import { CylinderGeometry, Group, Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from '@iwsdk/core';
import type { ShapeId } from '../hand/shapes.js';
import { blendPoses, POSES, synthHand } from '../hand/synthetic.js';
import { debugBasis } from './hands.js';

const BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8], [8, 9],
  [0, 10], [10, 11], [11, 12], [12, 13], [13, 14],
  [0, 15], [15, 16], [16, 17], [17, 18], [18, 19],
  [0, 20], [20, 21], [21, 22], [22, 23], [23, 24],
  [6, 11], [11, 16], [16, 21],
];
const UP = new Vector3(0, 1, 0);

export class GhostHand {
  readonly group = new Group();
  private readonly mat = new MeshBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0.0, depthWrite: false });
  private readonly bones: Mesh[] = [];
  private readonly joints: Mesh[] = [];
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private shape: ShapeId = 'rabbit';
  private t = 0;
  private visibleAmount = 0;
  show = false;

  constructor() {
    this.group.name = 'ghost-hand';
    // Stage-local spot between lamp and paper where the hand should go.
    this.group.position.set(0.07, 0.02, 0.22);
    const cyl = new CylinderGeometry(1, 1, 1, 8, 1, true);
    const sph = new SphereGeometry(1, 8, 6);
    for (let i = 0; i < BONES.length; i++) {
      const m = new Mesh(cyl, this.mat);
      m.renderOrder = 5;
      this.bones.push(m);
      this.group.add(m);
    }
    for (let i = 0; i < 25; i++) {
      const m = new Mesh(sph, this.mat);
      m.renderOrder = 5;
      this.joints.push(m);
      this.group.add(m);
    }
    this.group.visible = false;
  }

  setShape(shape: ShapeId): void {
    if (shape !== this.shape) this.t = 0;
    this.shape = shape;
  }

  update(dt: number): void {
    this.visibleAmount = Math.max(0, Math.min(1, this.visibleAmount + (this.show ? dt * 2 : -dt * 3)));
    this.group.visible = this.visibleAmount > 0.01;
    if (!this.group.visible) return;
    this.t += dt;
    // 0–0.8 s relaxed → shape, hold 1.6 s, then repeat. Wolf/duck also open and close.
    const cycle = this.t % 3.2;
    const k = Math.min(1, cycle / 0.8);
    const ease = k * k * (3 - 2 * k);
    const open = this.shape === 'rabbit' ? 0 : Math.max(0, Math.sin((cycle - 1.2) * 4)) * (cycle > 1.2 ? 1 : 0);
    const target = this.shape === 'rabbit' ? POSES.rabbit() : this.shape === 'wolf' ? POSES.wolf(open) : POSES.duck(open);
    const spec = blendPoses(POSES.relaxed(), target, ease);
    const q = debugBasis(this.shape);
    const j = synthHand(spec, { handedness: 'right', rotation: [q.x, q.y, q.z, q.w] });
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let i = 0; i < 25; i++) {
      cx += j[i * 3];
      cy += j[i * 3 + 1];
      cz += j[i * 3 + 2];
    }
    cx /= 25;
    cy /= 25;
    cz /= 25;
    const bob = Math.sin(this.t * 1.5) * 0.004;
    for (let i = 0; i < 25; i++) {
      this.joints[i].position.set(j[i * 3] - cx, j[i * 3 + 1] - cy + bob, j[i * 3 + 2] - cz);
      this.joints[i].scale.setScalar(i === 0 ? 0.011 : 0.0062);
    }
    for (let n = 0; n < BONES.length; n++) {
      const [i0, i1] = BONES[n];
      this.a.copy(this.joints[i0].position);
      this.b.copy(this.joints[i1].position);
      const m = this.bones[n];
      m.position.addVectors(this.a, this.b).multiplyScalar(0.5);
      const d = this.b.sub(this.a);
      const len = d.length();
      if (len > 1e-5) m.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / len));
      m.scale.set(0.0058, len, 0.0058);
    }
    this.mat.opacity = 0.32 * this.visibleAmount * (0.85 + 0.15 * Math.sin(this.t * 4));
  }
}
