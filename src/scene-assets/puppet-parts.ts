/** Flat rod-puppet construction: all contours lie in XY, front faces +Z. */
import { Group, Mesh, MeshBasicMaterial, PlaneGeometry, Shape, Vector3 } from '@iwsdk/core';
import { ellipse, inkMaterial, part, poly } from '../game/shapes2d.js';
import { PALETTE } from '../game/palette.js';

export interface PuppetRod {
  anchor: Group;
  mesh: Mesh;
  point: Vector3;
  lean: number;
}
export interface PuppetJoint {
  pivot: Group;
  phase: number;
  amplitude: number;
  rest: number;
}
export class PuppetParts {
  readonly root = new Group();
  readonly body = new Group();
  readonly controls = new Group();
  readonly ink: MeshBasicMaterial;
  readonly plate = inkMaterial(0x20292b);
  readonly pin = inkMaterial(0xc4b68e, 0.82);
  readonly rod = inkMaterial(0x46534e, 0.85);
  readonly bleed = inkMaterial(0x39756d, 0.2);
  readonly joints: PuppetJoint[] = [];
  readonly rods: PuppetRod[] = [];
  readonly eyes: Mesh[] = [];
  constructor(color: number = PALETTE.ink, name = 'puppet') {
    this.ink = inkMaterial(color);
    this.root.name = name;
    this.body.name = 'articulated-body';
    this.controls.name = 'control-rods';
    this.root.add(this.controls, this.body);
  }
  get mats(): MeshBasicMaterial[] {
    return [this.ink, this.plate, this.pin, this.rod, this.bleed];
  }
  cut(shape: Shape, holes: Shape[] = []): Shape {
    shape.holes.push(...holes);
    return shape;
  }
  add(parent: Group, shape: Shape | Shape[], name: string, mat = this.ink, z = 0): Mesh {
    const m = part(shape, mat, name);
    m.position.z = z;
    parent.add(m);
    return m;
  }
  /** Thin displaced duplicate reads as light leaking around a paper edge. */
  edge(parent: Group, shape: Shape, name: string): void {
    const m = this.add(parent, shape, name, this.bleed, -0.00015);
    m.position.x = 0.0008;
    m.position.y = -0.0005;
  }
  joint(parent: Group, x: number, y: number, r = 0.0026): void {
    this.add(parent, ellipse(x, y, r, r), 'joint-washer', this.plate, 0.00025);
    this.add(parent, [ellipse(x, y, r * 0.53, r * 0.53)], 'joint-pin', this.pin, 0.00045);
    this.add(parent, poly([[x-r*0.35,y-0.0002],[x+r*0.35,y-0.0002],[x+r*0.35,y+0.0002],[x-r*0.35,y+0.0002]]), 'pin-slot', this.ink, 0.0005);
  }
  hinge(parent: Group, name: string, x: number, y: number, phase = 0, amplitude = 0.1): Group {
    const g = new Group();
    g.name = name;
    g.position.set(x, y, 0.00015);
    parent.add(g);
    this.joints.push({ pivot: g, phase, amplitude, rest: 0 });
    return g;
  }
  eye(parent: Group, x: number, y: number, r = 0.0019): Mesh {
    const e = this.add(parent, poly([[x-r,y],[x,y+r*0.75],[x+r*1.4,y],[x,y-r*0.75]]), 'pierced-eye', this.pin, 0.0005);
    this.eyes.push(e);
    return e;
  }
  control(parent: Group, x: number, y: number, lean: number): void {
    const anchor = new Group();
    anchor.name = 'rod-attachment';
    anchor.position.set(x, y, 0);
    parent.add(anchor);
    this.joint(parent, x, y, 0.0018);
    const rod = new Mesh(new PlaneGeometry(0.00065, 1), this.rod);
    rod.name = 'bamboo-control-rod';
    rod.renderOrder = 2;
    rod.position.set(x + lean / 2, y - 0.05, -0.0001);
    rod.scale.y = 0.1;
    rod.rotation.z = Math.atan2(lean, 0.1);
    rod.userData.iwsdkPreviewBounds = 'exclude';
    this.controls.add(rod);
    this.rods.push({ anchor, mesh: rod, point: new Vector3(), lean });
  }
}

/** Pierced tear drops, with enough negative space to read at seated distance. */
export function lace(x: number, y: number, n: number, spacing: number, radius = 0.0012): Shape[] {
  return Array.from({ length: n }, (_, i) => ellipse(x + i * spacing, y + Math.sin(i * 1.8) * radius, radius, radius * 1.7, -0.3, 12));
}
