/**
 * Makes the tracked hands cast real shadows from the lamp.
 *
 * Preferred: the IWSDK hand visual's skinned mesh (the actual hand shape)
 * with castShadow on. Fallback (desktop debug hand, or if the skinned mesh is
 * missing): an invisible "proxy hand" of capsules built from the joints,
 * which casts a shadow but draws nothing.
 */
import {
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  type Scene,
  SkinnedMesh,
  SphereGeometry,
  Vector3,
  type World,
} from '@iwsdk/core';
import type { Handedness } from '../hand/joints.js';
import type { HandState } from './hands.js';

const BONES: [number, number][] = [
  [1, 2], [2, 3], [3, 4],
  [6, 7], [7, 8], [8, 9],
  [11, 12], [12, 13], [13, 14],
  [16, 17], [17, 18], [18, 19],
  [21, 22], [22, 23], [23, 24],
  // palm
  [0, 6], [0, 11], [0, 16], [0, 21], [6, 11], [11, 16], [16, 21], [0, 1], [1, 6], [2, 6],
];

const UP = new Vector3(0, 1, 0);

/** Invisible material: writes no colour and no depth, but still casts into shadow maps. */
function shadowOnlyMaterial(): MeshBasicMaterial {
  const m = new MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: DoubleSide });
  m.name = 'shadow-only';
  return m;
}

class ProxyHand {
  readonly group = new Group();
  private readonly bones: Mesh[] = [];
  private readonly joints: Mesh[] = [];
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly d = new Vector3();

  constructor(name: string, visibleForDebug = false) {
    this.group.name = name;
    const mat = visibleForDebug
      ? new MeshBasicMaterial({ color: 0x3a3a3a, transparent: true, opacity: 0.35 })
      : shadowOnlyMaterial();
    const cyl = new CylinderGeometry(1, 1, 1, 10, 1, true);
    const sph = new SphereGeometry(1, 10, 8);
    for (let i = 0; i < BONES.length; i++) {
      const m = new Mesh(cyl, mat);
      m.castShadow = true;
      m.frustumCulled = false;
      this.bones.push(m);
      this.group.add(m);
    }
    for (let i = 0; i < 25; i++) {
      const m = new Mesh(sph, mat);
      m.castShadow = true;
      m.frustumCulled = false;
      this.joints.push(m);
      this.group.add(m);
    }
  }

  update(state: HandState): void {
    const j = state.joints;
    const r = state.radii;
    for (let i = 0; i < 25; i++) {
      const m = this.joints[i];
      m.position.set(j[i * 3], j[i * 3 + 1], j[i * 3 + 2]);
      const rad = Math.max(0.006, r[i]) * (i === 0 ? 1.6 : 1);
      m.scale.setScalar(rad);
    }
    for (let k = 0; k < BONES.length; k++) {
      const [i0, i1] = BONES[k];
      this.a.set(j[i0 * 3], j[i0 * 3 + 1], j[i0 * 3 + 2]);
      this.b.set(j[i1 * 3], j[i1 * 3 + 1], j[i1 * 3 + 2]);
      const m = this.bones[k];
      this.d.subVectors(this.b, this.a);
      const len = this.d.length();
      m.position.addVectors(this.a, this.b).multiplyScalar(0.5);
      if (len > 1e-5) m.quaternion.setFromUnitVectors(UP, this.d.multiplyScalar(1 / len));
      const palm = k >= 15;
      const rad = palm ? 0.011 : Math.max(0.0055, (r[i0] + r[i1]) * 0.5);
      m.scale.set(rad, len, rad);
    }
  }
}

export class HandShadows {
  private readonly proxies: Record<Handedness, ProxyHand>;
  private readonly skinned: Record<Handedness, { model: Object3D | null; mesh: SkinnedMesh | null }> = {
    left: { model: null, mesh: null },
    right: { model: null, mesh: null },
  };
  /** Force the proxy even when a skinned hand exists (URL ?shadow=proxy). */
  forceProxy = false;

  constructor(scene: Scene, debugVisible = false) {
    this.proxies = { left: new ProxyHand('shadow-proxy-left', debugVisible), right: new ProxyHand('shadow-proxy-right', debugVisible) };
    scene.add(this.proxies.left.group, this.proxies.right.group);
  }

  update(world: World, hands: Record<Handedness, HandState>): void {
    for (const side of ['left', 'right'] as const) {
      const state = hands[side];
      const skinned = state.source === 'xr' && !this.forceProxy ? this.findSkinned(world, side) : null;
      const useProxy = state.tracked && !skinned;
      const proxy = this.proxies[side];
      proxy.group.visible = useProxy;
      if (useProxy) proxy.update(state);
    }
  }

  /** Locate the IWSDK hand visual's skinned mesh and turn its shadow on. */
  private findSkinned(world: World, side: Handedness): SkinnedMesh | null {
    const adapter = world.input.xr.visualAdapters.hand[side];
    const model = adapter?.visual?.model ?? null;
    const cache = this.skinned[side];
    if (model !== cache.model) {
      cache.model = model;
      cache.mesh = null;
      if (model) {
        const found: SkinnedMesh[] = [];
        model.traverse((o) => {
          if ((o as SkinnedMesh).isSkinnedMesh) found.push(o as SkinnedMesh);
        });
        // AnimatedHand adds an outline clone with renderOrder 999; cast from the base mesh only.
        found.sort((x, y) => x.renderOrder - y.renderOrder);
        for (const m of found) m.castShadow = false;
        if (found[0]) {
          found[0].castShadow = true;
          cache.mesh = found[0];
        }
      }
    }
    if (!cache.mesh || !model?.visible || !adapter.connected) return null;
    return cache.mesh;
  }
}
